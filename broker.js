const amqp = require('amqplib');
const mysql = require('mysql2/promise');

// Configuración desde variables de entorno
const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://Luis:Luis@54.237.63.42:5672';
const rfidQueueName = process.env.RFID_QUEUE || 'rfid_pill';
const sensorQueueName = process.env.SENSOR_QUEUE || 'sensor_data';
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'pillcore_database',
};

// Función para manejar datos de RFID
async function handleRFIDMessage(channel, message) {
  const rfidData = message.content.toString();
  console.log(`RFID escaneado: ${rfidData}`);

  // Reenviar al backend
  try {
    const axios = require('axios');
    await axios.post('http://localhost:8083/medicines/pending-rfids', { rfidTag: rfidData });
    console.log('Mensaje enviado al backend');
    channel.ack(message); // Confirmar mensaje procesado
  } catch (error) {
    console.error('Error enviando mensaje al backend:', error.message);
    channel.nack(message); // No confirmar mensaje para reintento
  }
}

// Función para manejar datos de sensores
async function handleSensorMessage(channel, message) {
  const sensorData = JSON.parse(message.content.toString());
  console.log(`Datos del sensor recibidos: ${JSON.stringify(sensorData)}`);

  // Guardar en la base de datos
  const connection = await mysql.createConnection(dbConfig);
  try {
    const { sensor_id, value, timestamp } = sensorData;
    await connection.execute(
      `INSERT INTO SensorActivity (sensor_id, value, event_time) VALUES (?, ?, ?)`,
      [sensor_id, value, timestamp || new Date()]
    );
    console.log('Datos del sensor almacenados en la base de datos');
    channel.ack(message); // Confirmar mensaje procesado
  } catch (error) {
    console.error('Error almacenando datos en la base de datos:', error.message);
    channel.nack(message); // No confirmar mensaje para reintento
  } finally {
    await connection.end();
  }
}

// Función para conectar a RabbitMQ con manejo de colas
async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitMQUrl);
    const channel = await connection.createChannel();

    // Asegurar que las colas existan
    await channel.assertQueue(rfidQueueName, { durable: true });
    await channel.assertQueue(sensorQueueName, { durable: true });

    console.log(`Conectado a RabbitMQ. Escuchando colas "${rfidQueueName}" y "${sensorQueueName}"`);

    // Consumir mensajes de RFID
    channel.consume(rfidQueueName, (message) => handleRFIDMessage(channel, message), {
      noAck: false,
    });

    // Consumir mensajes de sensores
    channel.consume(sensorQueueName, (message) => handleSensorMessage(channel, message), {
      noAck: false,
    });
  } catch (error) {
    console.error('Error al conectar con RabbitMQ:', error.message);
    setTimeout(connectToRabbitMQ, 5000); // Reintentar conexión en 5 segundos
  }
}

// Iniciar conexión a RabbitMQ
connectToRabbitMQ();
