const amqp = require('amqplib');
const mysql = require('mysql2/promise');
const axios = require('axios');

// Configuración desde variables de entorno
const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://Luis:Luis@54.237.63.42:5672';
const rfidQueueName = process.env.RFID_QUEUE || 'sensor_data'; // Exclusivo para RFID
const sensorsQueueName = process.env.SENSORS_QUEUE || 'sensores_data'; // Nueva cola para otros sensores
const notificationButtonQueueName = process.env.NOTIFICATION_BUTTON_QUEUE || 'boton_notificaciones';
const emergencyButtonQueueName = process.env.EMERGENCY_BUTTON_QUEUE || 'boton_alert';
const alertButtonQueueName = process.env.ALERT_BUTTON_QUEUE || 'boton_alerta'; // Nueva cola para el botón de alerta
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};

const MAX_RETRY_COUNT = 5;

// Crear un pool de conexiones MySQL
const dbPool = mysql.createPool(dbConfig);

// Función para insertar en la base de datos
async function insertIntoDatabase(sensorId, value, message) {
  try {
    const connection = await dbPool.getConnection();
    const query = `
      INSERT INTO SensorActivity (sensor_id, value, message) 
      VALUES (?, ?, ?)
    `;
    await connection.query(query, [sensorId, value, message]);
    console.log(`Datos insertados: Sensor ID = ${sensorId}, Valor = ${value}, Mensaje = "${message}"`);
    connection.release();
  } catch (error) {
    console.error('Error al insertar en la base de datos:', error.message);
  }
}

// Función para manejar mensajes de la cola sensores_data
async function handleSensorsDataMessage(channel, message) {
  if (!message) return;

  try {
    // Parsear el contenido del mensaje
    const sensorData = JSON.parse(message.content.toString());
    const { sensor_id, value, message: sensorMessage } = sensorData;

    console.log(`Mensaje recibido: Sensor ID = ${sensor_id}, Valor = ${value}, Mensaje = "${sensorMessage}"`);

    // Guardar en la base de datos
    await insertIntoDatabase(sensor_id, value, sensorMessage);

    // Confirmar el procesamiento del mensaje
    channel.ack(message);
    console.log('Mensaje procesado y guardado en la base de datos');
  } catch (error) {
    console.error('Error procesando el mensaje de sensores_data:', error.message);

    const retryCount = (message.properties && message.properties.headers && message.properties.headers['x-retry']) || 0;

    if (retryCount < MAX_RETRY_COUNT) {
      const newRetryCount = retryCount + 1;
      console.warn(`Reintentando mensaje (${newRetryCount} de ${MAX_RETRY_COUNT})`);
      channel.sendToQueue(sensorsQueueName, Buffer.from(message.content), {
        headers: { 'x-retry': newRetryCount },
        persistent: true,
      });
    } else {
      console.warn(`Mensaje descartado tras ${retryCount} reintentos fallidos: ${message.content.toString()}`);
      channel.sendToQueue(`${sensorsQueueName}_dlq`, Buffer.from(message.content), {
        persistent: true,
      });
    }

    channel.ack(message);
  }
}

// Función para manejar mensajes del botón de notificaciones
async function handleNotificationButtonMessage(channel, message) {
  if (!message) return;

  const buttonMessage = message.content.toString();
  console.log(`Mensaje recibido del botón de notificaciones: ${buttonMessage}`);

  const retryCount = (message.properties && message.properties.headers && message.properties.headers['x-retry']) || 0;

  try {
    const response = await axios.post('http://localhost:8083/notification/button-pressed', 
      { event: "botón notificaciones presionado" },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('Confirmación enviada al backend:', response.data);
    channel.ack(message); 
  } catch (error) {
    console.error('Error enviando mensaje del botón de notificaciones al backend:', error.message);

    if (retryCount < MAX_RETRY_COUNT) {
      const newRetryCount = retryCount + 1;
      console.warn(`Reintentando mensaje del botón de notificaciones (${newRetryCount} de ${MAX_RETRY_COUNT})`);
      channel.sendToQueue(notificationButtonQueueName, Buffer.from(buttonMessage), {
        headers: { 'x-retry': newRetryCount },
        persistent: true,
      });
    } else {
      console.warn(`Mensaje descartado tras ${retryCount} reintentos fallidos: ${buttonMessage}`);
      channel.sendToQueue(`${notificationButtonQueueName}_dlq`, Buffer.from(buttonMessage), {
        persistent: true,
      });
      channel.ack(message);
    }
  }
}

// Función para manejar mensajes del botón de alerta
async function handleAlertButtonMessage(channel, message) {
  if (!message) return;

  const alertMessage = message.content.toString();
  console.log(`Mensaje recibido del botón de alerta: ${alertMessage}`);

  const retryCount = (message.properties && message.properties.headers && message.properties.headers['x-retry']) || 0;

  try {
    const response = await axios.post('http://localhost:8083/alerts/button-pressed', 
      { event: "botón alerta presionado" },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('Alerta enviada al backend:', response.data);
    channel.ack(message); 
  } catch (error) {
    console.error('Error enviando mensaje del botón de alerta al backend:', error.message);

    if (retryCount < MAX_RETRY_COUNT) {
      const newRetryCount = retryCount + 1;
      console.warn(`Reintentando mensaje del botón de alerta (${newRetryCount} de ${MAX_RETRY_COUNT})`);
      channel.sendToQueue(alertButtonQueueName, Buffer.from(alertMessage), {
        headers: { 'x-retry': newRetryCount },
        persistent: true,
      });
    } else {
      console.warn(`Mensaje descartado tras ${retryCount} reintentos fallidos: ${alertMessage}`);
      channel.sendToQueue(`${alertButtonQueueName}_dlq`, Buffer.from(alertMessage), {
        persistent: true,
      });
      channel.ack(message);
    }
  }
}

// Consumir mensajes de RabbitMQ
async function connectToRabbitMQ() {
  try {
    console.log('Intentando conectar a RabbitMQ...');
    const connection = await amqp.connect(rabbitMQUrl);
    const channel = await connection.createChannel();

    console.log('Configurando colas...');
    await channel.assertQueue(rfidQueueName, { durable: true });
    await channel.assertQueue(sensorsQueueName, { durable: true });
    await channel.assertQueue(notificationButtonQueueName, { durable: true });
    await channel.assertQueue(emergencyButtonQueueName, { durable: true });
    await channel.assertQueue(alertButtonQueueName, { durable: true });
    await channel.assertQueue(`${rfidQueueName}_dlq`, { durable: true });
    await channel.assertQueue(`${sensorsQueueName}_dlq`, { durable: true });

    channel.prefetch(10);

    // Consumir mensajes de las colas
    channel.consume(notificationButtonQueueName, (message) => {
      console.log(`Mensaje recibido en la cola "${notificationButtonQueueName}"`);
      handleNotificationButtonMessage(channel, message);
    }, { noAck: false });

    channel.consume(alertButtonQueueName, (message) => {
      console.log(`Mensaje recibido en la cola "${alertButtonQueueName}"`);
      handleAlertButtonMessage(channel, message);
    }, { noAck: false });

    channel.consume(rfidQueueName, (message) => {
      console.log(`Mensaje recibido en la cola "${rfidQueueName}"`);
      handleSensorDataMessage(channel, message); // Supongo que ya tienes esto funcionando para RFID
    }, { noAck: false });

    channel.consume(sensorsQueueName, (message) => {
      console.log(`Mensaje recibido en la cola "${sensorsQueueName}"`);
      handleSensorsDataMessage(channel, message);
    }, { noAck: false });

  } catch (error) {
    console.error('Error al conectar con RabbitMQ:', error.message);
    setTimeout(connectToRabbitMQ, 5000);
  }
}

// Iniciar conexión
connectToRabbitMQ();
