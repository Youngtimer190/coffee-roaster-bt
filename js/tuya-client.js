// Tuya Thermometer Client - Serverless API
class TuyaThermometer {
constructor(app) {
this.app = app;
this.connected = false;
this.temperature = null;
this.pollingInterval = null;
this.lastUpdate = null;
this.onTemperatureUpdate = null;

// API endpoint (Vercel serverless function)
this.apiEndpoint = '/api/tuya';

console.log('TuyaThermometer: Moduł zainicjalizowany');
}

// Sprawdź połączenie i pobierz temperaturę
async checkConnection() {
try {
const response = await fetch(this.apiEndpoint);
const data = await response.json();

if (data.success) {
this.connected = true;
this.temperature = data.temperature;
this.lastUpdate = new Date(data.timestamp);

if (this.onTemperatureUpdate && data.temperature !== null) {
this.onTemperatureUpdate(data.temperature);
}

return {
connected: true,
temperature: data.temperature,
raw: data.raw
};
} else {
this.connected = false;
console.error('Tuya API error:', data.error);
return {
connected: false,
error: data.error
};
}
} catch (error) {
console.error('Tuya connection error:', error);
this.connected = false;
return {
connected: false,
error: error.message
};
}
}

// Pobierz aktualną temperaturę
async getTemperature() {
const result = await this.checkConnection();
return result.temperature;
}

// Rozpocznij automatyczne odświeżanie (co 2 sekundy)
startPolling(intervalMs = 2000) {
if (this.pollingInterval) {
this.stopPolling();
}

// Natychmiastowy pierwszy odczyt
this.checkConnection();

// Potem co określony interwał
this.pollingInterval = setInterval(async () => {
const result = await this.checkConnection();

if (result.connected && this.temperature !== null) {
this.updateUI(this.temperature);
}
}, intervalMs);

console.log(`TuyaThermometer: Rozpoczęto polling (co ${intervalMs}ms)`);
}

// Zatrzymaj automatyczne odświeżanie
stopPolling() {
if (this.pollingInterval) {
clearInterval(this.pollingInterval);
this.pollingInterval = null;
console.log('TuyaThermometer: Zatrzymano polling');
}
}

// Aktualizuj UI
updateUI(temp) {
const tempDisplay = document.getElementById('btTempValue');
const tempContainer = document.getElementById('btTemperature');
const statusEl = document.getElementById('btStatus');

if (tempDisplay) {
tempDisplay.textContent = temp.toFixed(1);
}

// Kolorystyka wg temperatury
if (tempContainer) {
tempContainer.classList.remove('temp-low', 'temp-medium', 'temp-high', 'temp-crack', 'disconnected');

if (temp < 150) {
tempContainer.classList.add('temp-low');
} else if (temp < 190) {
tempContainer.classList.add('temp-medium');
} else if (temp < 210) {
tempContainer.classList.add('temp-high');
} else {
tempContainer.classList.add('temp-crack');
}
}

// Aktualizuj temperaturę w modalu palenia
const roastingTemp = document.getElementById('roastingCurrentTemp');
if (roastingTemp && document.getElementById('roastingModal').classList.contains('active')) {
roastingTemp.textContent = temp.toFixed(1) + '°C';
}

// Wywołaj callback dla stopera w modalu profilu
if (this.onTemperatureUpdate) {
this.onTemperatureUpdate(temp);
}
}

// Czy połączony
isConnected() {
return this.connected;
}

// Pobierz ostatnią temperaturę
getLastTemperature() {
return this.temperature;
}
}

// Eksportuj globalnie
window.TuyaThermometer = TuyaThermometer;
