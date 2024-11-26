const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = 3000; // Cambia el puerto según necesites

const corsOptions = {
  origin: ['http://54.163.130.107:3000', 'http://127.0.0.1:5500', 'https://pillcare.zapto.org/','http://localhost:5173/'], // Reemplaza con el dominio permitido
  methods: ['GET', 'POST'], // Métodos permitidos
  allowedHeaders: ['Content-Type'] // Cabeceras permitidas
};
app.use(cors(corsOptions));

// Almacenar temporalmente las alertas en memoria
let firstAlertTriggered = false; // Variable para rastrear si llegó el primer mensaje específico

// Middleware para parsear el body de las solicitudes
app.use(bodyParser.json());

// Endpoint POST: Recibe las alertas del RabbitMQ Consumer
app.post('/alerts', (req, res) => {
  const alert = req.body;

  // Validar que el mensaje contiene el campo "event"
  if (!alert || !alert.event) {
      console.log('POST /alerts -> Formato de alerta inválido:', req.body);
      return res.status(400).json({ message: 'Formato de alerta inválido' });
  }

  console.log('POST /alerts -> Recibido:', alert);

  // Revisar si es el primer mensaje específico (eliminando acentos para evitar errores)
  if (alert.event.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'boton alerta presionado') {
      console.log('POST /alerts -> Evento "botón alerta presionado" detectado.');
      firstAlertTriggered = true; // Marcar como recibido
  }

  // Responder con éxito
  res.status(200).json({ message: 'Alerta almacenada exitosamente' });
});

// Endpoint GET: Consumir alertas con valor específico
app.get('/alerts/consume', (req, res) => {
    console.log('GET /alerts/consume -> Estado de firstAlertTriggered:', firstAlertTriggered);

    if (firstAlertTriggered) {
        // Si el primer mensaje específico llegó, enviar `alert: 1`
        console.log('GET /alerts/consume -> Enviando alert: 1');
        firstAlertTriggered = false; // Resetear después de servir
        return res.status(200).json({ alert: 1 });
    }

    // Si no llegó el mensaje específico, enviar `alert: 0`
    console.log('GET /alerts/consume -> Enviando alert: 0');
    return res.status(200).json({ alert: 0 });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`API escuchando en http://localhost:${PORT}`);
});
