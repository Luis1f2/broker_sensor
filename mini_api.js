const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // 
const app = express();
const PORT = 3000; // Cambia el puerto según necesites
const corsOptions = {
  origin: ['http://54.163.130.107:3000','https://pillcare.zapto.org'], // Reemplaza con el dominio permitido
  methods: ['GET', 'POST'], // Métodos permitidos
  allowedHeaders: ['Content-Type'] // Cabeceras permitidas
};
app.use(cors(corsOptions));



// Almacenar temporalmente las alertas en memoria
let alerts = [];

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
  
    // Si solo necesitas almacenar el campo "event", no haces transformación
    alerts.push(alert);
  
    console.log('POST /alerts -> Alerta recibida y almacenada:', alert);
  
    // Responder con éxito
    res.status(200).json({ message: 'Alerta almacenada exitosamente' });
  });
  

// Endpoint GET: Exponer las alertas para el frontend
app.get('/alerts', (req, res) => {
  // Mostrar las alertas almacenadas en la terminal
  console.log('GET /alerts -> Enviando alertas:', alerts);

  // Retornar las alertas almacenadas
  res.status(200).json(alerts);
});

// Limpiar las alertas después de servirlas (opcional, si las alertas son "consumibles" una vez)
app.get('/alerts/consume', (req, res) => {
  const consumedAlerts = [...alerts];
  alerts = []; // Limpiar las alertas

  // Mostrar las alertas consumidas en la terminal
  console.log('GET /alerts/consume -> Alertas consumidas:', consumedAlerts);

  res.status(200).json(consumedAlerts);
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
