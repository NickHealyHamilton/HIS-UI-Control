// devServer.js
const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const port = 3001; // Different from your React app port

app.use(express.json());

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.post('/dev/restart', (req, res) => {
  const scriptPath = path.resolve(__dirname, '../HIS Backend/Restart-Services.ps1');
  
  exec(`powershell -File "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error executing restart script:', error);
      res.status(500).json({ error: 'Failed to restart services' });
      return;
    }
    
    console.log('Restart output:', stdout);
    if (stderr) console.error('Restart errors:', stderr);
    
    res.json({ message: 'Services restarting' });
  });
});

app.listen(port, () => {
  console.log(`Dev server running on port ${port}`);
});