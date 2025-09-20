// test_server.js
const express = require('express');
const app = express();
const port = 5000; // Ou 8000 si vous changez le port

app.get('/', (req, res) => {
  res.send('Hello from simple test server!');
});

app.listen(port, () => {
  console.log(`Test server running on port ${port}`);
});