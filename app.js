// --- CONFIGURATION ---
const CLUSTER_URL = "63a94dada2fa46b797e4d6fdf720f43f.s1.eu.hivemq.cloud"; 
const MQTT_USER = "Marvin";
const MQTT_PASS = "RoseAnn1";
const TOPIC = "lettuce/system/telemetry";

// WebSockets connection options for HiveMQ Cloud
const options = {
    connectTimeout: 5000,
    clientId: 'lettuce_gh_pages_' + Math.random().toString(16).substr(2, 8),
    username: MQTT_USER,
    password: MQTT_PASS,
    clean: true
};

// Formulate secure WebSocket string targeting Port 8884
const brokerUrl = `wss://${CLUSTER_URL}:8884/mqtt`;

console.log("Connecting to broker...");
const client = mqtt.connect(brokerUrl, options);

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const elN = document.getElementById('val-n');
const elP = document.getElementById('val-p');
const elK = document.getElementById('val-k');
const elPh = document.getElementById('val-ph');
const elTemp = document.getElementById('val-temp');
const elHumidity = document.getElementById('val-humidity');

// --- MQTT EVENTS ---
client.on('connect', () => {
    console.log('Connected to HiveMQ Cloud successfully!');
    statusDot.classList.add('connected');
    statusText.innerText = 'Live Feed Connected';
    
    // Subscribe to hydroponics line
    client.subscribe(TOPIC, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${TOPIC}`);
        } else {
            console.error('Subscription error:', err);
        }
    });
});

client.on('message', (topic, message) => {
    try {
        // Convert buffer string to JSON object
        const data = JSON.parse(message.toString());
        console.log('Received Telemetry Data:', data);
        
        // Dynamic DOM Updates
        if (data.hasOwnProperty('N')) elN.innerText = data.N;
        if (data.hasOwnProperty('P')) elP.innerText = data.P;
        if (data.hasOwnProperty('K')) elK.innerText = data.K;
        if (data.hasOwnProperty('pH')) elPh.innerText = Number(data.pH).toFixed(2);
        if (data.hasOwnProperty('water_temp')) elTemp.innerText = Number(data.water_temp).toFixed(1);
        if (data.hasOwnProperty('humidity')) elHumidity.innerText = Number(data.humidity).toFixed(1);
        
    } catch (e) {
        console.error('Malformed JSON payload received:', e);
    }
});

client.on('close', () => {
    statusDot.classList.remove('connected');
    statusText.innerText = 'Disconnected. Retrying...';
});

client.on('error', (err) => {
    console.error('MQTT Connection Error: ', err);
    statusDot.classList.remove('connected');
    statusText.innerText = 'Connection Error';
});