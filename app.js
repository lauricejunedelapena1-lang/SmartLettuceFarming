/* ============================================
   Lettuce Smart-Grow | app.js
   ESP32 HiveMQ Cloud + Charts + Live Telemetry
   ============================================ */

// ---- MQTT Config — matches ESP32 firmware ----
const MQTT_BROKER = 'wss://63a94dada2fa46b797e4d6fdf720f43f.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USER   = 'Marvin';
const MQTT_PASS   = 'RoseAnn1';
const MQTT_TOPIC  = 'lettuce/system/telemetry';  // single topic, JSON payload

// ESP32 JSON keys: { N, P, K, pH, water_temp, humidity }

// ---- State ----
const HISTORY_LEN = 20;
const state = {
  ph:       null,
  temp:     null,
  humidity: null,
  n: null, p: null, k: null,
  phHistory:   Array(HISTORY_LEN).fill(null),
  tempHistory: Array(HISTORY_LEN).fill(null),
  humHistory:  Array(HISTORY_LEN).fill(null),
  lastPh: null, lastTemp: null, lastHum: null,
  lastUpdate: null,
  dosingMin: 14,
  demoMode: false,
};

// ---- DOM Refs ----
const $ = id => document.getElementById(id);
const dom = {
  clock:       $('clock'),
  statusDot:   $('status-dot'),
  statusText:  $('status-text'),
  ph:          $('val-ph'),
  temp:        $('val-temp'),
  hum:         $('val-humidity'),
  lastUpdate:  $('val-last-update'),
  n:           $('val-n'),
  p:           $('val-p'),
  k:           $('val-k'),
  barN:        $('bar-n'),
  barP:        $('bar-p'),
  barK:        $('bar-k'),
  phCenter:    $('ph-center'),
  trendPh:     $('trend-ph'),
  trendTemp:   $('trend-temp'),
  trendHum:    $('trend-hum'),
  chipHum:     $('chip-hum'),
  chipPh:      $('chip-ph'),
  dosing:      $('dosing-countdown'),
};

// ---- Chart Setup ---- (always dark theme)
const isDark    = true;
const gridColor = 'rgba(52,211,120,0.06)';
const tickColor = '#3d6347';

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
};

// History Line Chart
const histChart = new Chart($('histChart'), {
  type: 'line',
  data: {
    labels: Array(HISTORY_LEN).fill(''),
    datasets: [
      {
        label: 'pH',
        data: Array(HISTORY_LEN).fill(null),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.07)',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
        yAxisID: 'yPh',
        spanGaps: false,
      },
      {
        label: 'Temp (°C)',
        data: Array(HISTORY_LEN).fill(null),
        borderColor: '#fb7185',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.4,
        yAxisID: 'yTemp',
        spanGaps: false,
      },
      {
        label: 'Humidity (%)',
        data: Array(HISTORY_LEN).fill(null),
        borderColor: '#a78bfa',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.4,
        yAxisID: 'yHum',
        spanGaps: false,
      },
    ],
  },
  options: {
    ...chartDefaults,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y !== null
            ? `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`
            : `${ctx.dataset.label}: —`,
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { display: false } },
      yPh: {
        position: 'left',
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 }, callback: v => v.toFixed(1) },
        border: { dash: [3, 3] },
        min: 4, max: 8,
      },
      yTemp: {
        position: 'right',
        grid: { display: false },
        ticks: { color: '#fb7185', font: { size: 10 }, callback: v => v.toFixed(0) + '°' },
        min: 15, max: 35,
      },
      yHum: { display: false, min: 0, max: 100 },
    },
  },
});

// NPK Bar Chart
const npkChart = new Chart($('npkChart'), {
  type: 'bar',
  data: {
    labels: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: [
        'rgba(52,211,120,0.7)',
        'rgba(251,113,133,0.7)',
        'rgba(167,139,250,0.7)',
      ],
      borderRadius: 5,
      borderSkipped: false,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} mg/kg` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 } },
        border: { dash: [3, 3] },
        min: 0, max: 250,
      },
    },
  },
});

// pH Gauge (doughnut)
const phGauge = new Chart($('phGauge'), {
  type: 'doughnut',
  data: {
    datasets: [{
      data: [0, 14],
      backgroundColor: ['#38bdf8', 'rgba(56,189,248,0.06)'],
      borderWidth: 0,
      circumference: 220,
      rotation: 250,
    }],
  },
  options: {
    ...chartDefaults,
    cutout: '82%',
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  },
});

// Scatter Chart
const scatterChart = new Chart($('scatterChart'), {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Readings',
      data: [],
      backgroundColor: 'rgba(52,211,120,0.6)',
      pointRadius: 5,
      pointHoverRadius: 7,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}°C | ${ctx.parsed.y}%` } },
    },
    scales: {
      x: {
        title: { display: true, text: 'Temperature (°C)', color: tickColor, font: { size: 10 } },
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 } },
        min: 15, max: 35,
      },
      y: {
        title: { display: true, text: 'Humidity (%)', color: tickColor, font: { size: 10 } },
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 } },
        min: 0, max: 100,
      },
    },
  },
});

// ---- Helpers ----
function setTrend(el, current, prev, unit = '') {
  if (current === null || prev === null) {
    el.innerHTML = `<i class="ti ti-minus"></i> Waiting...`;
    el.className = 'metric-trend trend-neutral';
    return;
  }
  const diff = +(current - prev).toFixed(2);
  const sign = diff > 0 ? '+' : '';
  if (Math.abs(diff) < 0.01) {
    el.innerHTML = `<i class="ti ti-minus"></i> Stable`;
    el.className = 'metric-trend trend-neutral';
  } else if (diff > 0) {
    el.innerHTML = `<i class="ti ti-trending-up"></i> ${sign}${diff}${unit}`;
    el.className = 'metric-trend trend-up';
  } else {
    el.innerHTML = `<i class="ti ti-trending-down"></i> ${diff}${unit}`;
    el.className = 'metric-trend trend-dn';
  }
}

function updateNPKBars(n, p, k) {
  if (n === null) return;
  const MAX = 200;
  dom.barN.style.width = Math.min((n / MAX) * 100, 100).toFixed(1) + '%';
  dom.barP.style.width = Math.min((p / MAX) * 100, 100).toFixed(1) + '%';
  dom.barK.style.width = Math.min((k / MAX) * 100, 100).toFixed(1) + '%';
  dom.n.textContent = n;
  dom.p.textContent = p;
  dom.k.textContent = k;
}

function updateDOM() {
  const { ph, temp, humidity, n, p, k } = state;

  dom.ph.textContent   = ph   !== null ? ph.toFixed(1)   : '--';
  dom.temp.textContent = temp !== null ? temp.toFixed(1) : '--';
  dom.hum.textContent  = humidity !== null ? humidity    : '--';

  // Last update timestamp
  if (state.lastUpdate) {
    dom.lastUpdate.textContent = state.lastUpdate.toTimeString().slice(0, 8);
  }

  dom.phCenter.textContent = ph !== null ? ph.toFixed(1) : '--';

  setTrend(dom.trendPh,   ph,       state.lastPh,   '');
  setTrend(dom.trendTemp, temp,     state.lastTemp, '°');
  setTrend(dom.trendHum,  humidity, state.lastHum,  '%');

  // Humidity status chip
  if (humidity === null) {
    dom.chipHum.className = 'status-chip chip-info';
    dom.chipHum.innerHTML = `<i class="ti ti-hourglass"></i> Awaiting data`;
  } else if (humidity < 60) {
    dom.chipHum.className = 'status-chip chip-warn';
    dom.chipHum.innerHTML = `<i class="ti ti-alert-triangle"></i> Humidity Low`;
  } else if (humidity > 85) {
    dom.chipHum.className = 'status-chip chip-warn';
    dom.chipHum.innerHTML = `<i class="ti ti-alert-triangle"></i> Humidity High`;
  } else {
    dom.chipHum.className = 'status-chip chip-ok';
    dom.chipHum.innerHTML = `<i class="ti ti-check"></i> Humidity OK`;
  }

  // pH status chip
  if (ph === null) {
    dom.chipPh.className = 'status-chip chip-info';
    dom.chipPh.innerHTML = `<i class="ti ti-hourglass"></i> Awaiting pH`;
  } else if (ph < 5.5 || ph > 6.5) {
    dom.chipPh.className = 'status-chip chip-warn';
    dom.chipPh.innerHTML = `<i class="ti ti-alert-triangle"></i> pH Out of Range`;
  } else {
    dom.chipPh.className = 'status-chip chip-ok';
    dom.chipPh.innerHTML = `<i class="ti ti-check"></i> pH Optimal`;
  }

  updateNPKBars(n, p, k);

  // Push to history
  state.phHistory.push(ph);     state.phHistory.shift();
  state.tempHistory.push(temp); state.tempHistory.shift();
  state.humHistory.push(humidity); state.humHistory.shift();

  // Update charts
  histChart.data.datasets[0].data = [...state.phHistory];
  histChart.data.datasets[1].data = [...state.tempHistory];
  histChart.data.datasets[2].data = [...state.humHistory];
  histChart.update('none');

  if (n !== null) {
    npkChart.data.datasets[0].data = [n, p, k];
    npkChart.update('none');
  }

  if (ph !== null) {
    phGauge.data.datasets[0].data = [ph, 14 - ph];
    phGauge.update('none');
  }

  // Scatter: only plot non-null pairs
  scatterChart.data.datasets[0].data = state.tempHistory
    .map((t, i) => (t !== null && state.humHistory[i] !== null)
      ? { x: +t.toFixed(1), y: state.humHistory[i] }
      : null)
    .filter(Boolean);
  scatterChart.update('none');

  state.lastPh   = ph;
  state.lastTemp = temp;
  state.lastHum  = humidity;
}

// ---- Ingest a payload from ESP32 ----
// Expected: { N, P, K, pH, water_temp, humidity }
function ingestPayload(data) {
  state.lastUpdate = new Date();

  if (data.pH       !== undefined) state.ph       = parseFloat(data.pH);
  if (data.water_temp !== undefined) state.temp   = parseFloat(data.water_temp);
  if (data.humidity !== undefined) state.humidity = parseFloat(data.humidity);
  if (data.N        !== undefined) state.n        = parseFloat(data.N);
  if (data.P        !== undefined) state.p        = parseFloat(data.P);
  if (data.K        !== undefined) state.k        = parseFloat(data.K);

  updateDOM();
}

// ---- Clock ----
function tickClock() {
  dom.clock.textContent = new Date().toTimeString().slice(0, 8);
}
setInterval(tickClock, 1000);
tickClock();

// ---- Dosing Countdown ----
setInterval(() => {
  state.dosingMin = state.dosingMin <= 1 ? 15 : state.dosingMin - 1;
  dom.dosing.textContent = state.dosingMin;
}, 60000);

// ---- MQTT Connection ----
let mqttClient = null;
let demoInterval = null;

function connectMQTT() {
  dom.statusDot.className = 'conn-dot connecting';
  dom.statusText.textContent = 'Connecting to HiveMQ...';

  mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId:        'lettuce_dash_' + Math.random().toString(16).slice(2, 8),
    username:        MQTT_USER,
    password:        MQTT_PASS,
    clean:           true,
    reconnectPeriod: 5000,
    connectTimeout:  10000,
  });

  mqttClient.on('connect', () => {
    dom.statusDot.className = 'conn-dot connected';
    dom.statusText.textContent = 'HiveMQ Connected';
    console.log('[MQTT] Connected — subscribing to', MQTT_TOPIC);

    // Stop demo mode if it was running
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
      state.demoMode = false;
    }

    mqttClient.subscribe(MQTT_TOPIC, err => {
      if (err) console.error('[MQTT] Subscribe error:', err);
      else console.log('[MQTT] Subscribed to', MQTT_TOPIC);
    });
  });

  mqttClient.on('message', (topic, message) => {
    if (topic !== MQTT_TOPIC) return;
    try {
      const data = JSON.parse(message.toString());
      console.log('[MQTT] Received:', data);
      ingestPayload(data);
    } catch (e) {
      console.warn('[MQTT] JSON parse error:', e, '| Raw:', message.toString());
    }
  });

  mqttClient.on('error', err => {
    console.error('[MQTT] Error:', err);
    dom.statusDot.className = 'conn-dot error';
    dom.statusText.textContent = 'Connection Error';
  });

  mqttClient.on('offline', () => {
    dom.statusDot.className = 'conn-dot connecting';
    dom.statusText.textContent = 'Reconnecting...';
  });

  mqttClient.on('reconnect', () => {
    dom.statusDot.className = 'conn-dot connecting';
    dom.statusText.textContent = 'Reconnecting...';
  });

  // Fallback: if no real data within 8s, start demo mode
  setTimeout(() => {
    if (state.lastUpdate === null) {
      console.warn('[MQTT] No data received in 8s — starting demo mode');
      startDemoMode();
    }
  }, 8000);
}

// ---- Demo Mode ----
function rnd(base, range) {
  return +(base + (Math.random() - 0.5) * range).toFixed(2);
}

function startDemoMode() {
  if (state.demoMode) return;
  state.demoMode = true;
  dom.statusDot.className = 'conn-dot connecting';
  dom.statusText.textContent = 'Demo Mode (no ESP32)';

  // Seed with realistic lettuce hydroponics values
  ingestPayload({ N: 144, P: 90, K: 170, pH: 6.1, water_temp: 21.3, humidity: 68 });

  demoInterval = setInterval(() => {
    // Only run demo if MQTT hasn't taken over
    if (state.demoMode) {
      ingestPayload({
        N:          Math.round(rnd(144, 24)),
        P:          Math.round(rnd(90,  18)),
        K:          Math.round(rnd(170, 22)),
        pH:         rnd(6.1, 0.4),
        water_temp: rnd(21.3, 1.2),
        humidity:   Math.round(rnd(67,  6)),
      });
    }
  }, 2500);
}

// ---- Init ----
updateDOM(); // render empty state immediately

if (typeof mqtt !== 'undefined') {
  connectMQTT();
} else {
  console.warn('[INIT] mqtt.js not loaded — demo mode');
  startDemoMode();
}
