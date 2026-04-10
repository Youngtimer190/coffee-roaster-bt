// ===== BLUETOOTH KT210 MODULE =====
// Obsługa termometru KT210 przez Web Bluetooth API

class BluetoothKT210 {
    constructor(app) {
        this.app = app;
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.connected = false;
        this.temperature = null;
        this.onTemperatureUpdate = null;

        // UUID dla urządzeń Tuya/KT210
        // KT210 używa standardowego service'u Environment Sensing (0x181A)
        // lub custom service Tuya (0xFD50)
        this.SERVICE_UUIDS = [
            '0000181a-0000-1000-8000-00805f9b34fb', // Environment Sensing Service
            '0000fd50-0000-1000-8000-00805f9b34fb', // Tuya Smart Service
            '0000fff0-0000-1000-8000-00805f9b34fb', // Common custom service
        ];

        // Characteristic UUIDs do odczytu temperatury
        this.TEMP_CHARACTERISTIC_UUIDS = [
            '00002a6e-0000-1000-8000-00805f9b34fb', // Temperature Measurement (ESS)
            '00002a1c-0000-1000-8000-00805f9b34fb', // Temperature Type (ESS)
        ];

        // Tuya data characteristic (dla custom protokołu)
        this.TUYA_DATA_UUID = '0000fd51-0000-1000-8000-00805f9b34fb';
        this.TUYA_COMMAND_UUID = '0000fd52-0000-1000-8000-00805f9b34fb';

        console.log('BluetoothKT210: Moduł zainicjalizowany');
    }

    // Sprawdź czy Web Bluetooth jest dostępne
    isAvailable() {
        return 'bluetooth' in navigator;
    }

    // Połącz z urządzeniem
    async connect() {
        if (!this.isAvailable()) {
            throw new Error('Web Bluetooth nie jest dostępne w tej przeglądarce');
        }

        try {
            console.log('BluetoothKT210: Rozpoczynam skanowanie...');

            // Opcje skanowania
            const options = {
                acceptAllDevices: false,
                filters: [
                    { namePrefix: 'KT' },
                    { namePrefix: 'Tuya' },
                    { namePrefix: 'TH' },
                    { services: ['0000181a-0000-1000-8000-00805f9b34fb'] },
                    { services: ['0000fd50-0000-1000-8000-00805f9b34fb'] }
                ],
                optionalServices: [
                    '0000181a-0000-1000-8000-00805f9b34fb',
                    '0000fd50-0000-1000-8000-00805f9b34fb',
                    '0000fff0-0000-1000-8000-00805f9b34fb'
                ]
            };

            // Skanuj dla urządzeń
            this.device = await navigator.bluetooth.requestDevice(options);

            console.log('BluetoothKT210: Znaleziono urządzenie:', this.device.name);

            // Nasłuchuj na rozłączenie
            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });

            // Połącz z GATT Server
            console.log('BluetoothKT210: Łączenie z GATT Server...');
            this.server = await this.device.gatt.connect();

            // Pobierz service
            const service = await this.findService();
            if (!service) {
                throw new Error('Nie znaleziono odpowiedniego service\'u');
            }

            // Znajdź characteristic dla temperatury
            await this.setupCharacteristics(service);

            this.connected = true;
            console.log('BluetoothKT210: Połączono pomyślnie!');

            return true;

        } catch (error) {
            console.error('BluetoothKT210: Błąd połączenia:', error);
            throw error;
        }
    }

    // Znajdź odpowiedni service
    async findService() {
        const services = await this.server.getPrimaryServices();
        console.log('BluetoothKT210: Dostępne serwisy:', services.map(s => s.uuid));

        for (const service of services) {
            for (const uuid of this.SERVICE_UUIDS) {
                try {
                    if (service.uuid === uuid || service.uuid.toLowerCase() === uuid.toLowerCase()) {
                        console.log('BluetoothKT210: Znaleziono service:', service.uuid);
                        return service;
                    }
                } catch (e) {}
            }
        }

        // Zwróć pierwszy dostępny service jeśli żaden z UUID nie pasuje
        if (services.length > 0) {
            console.log('BluetoothKT210: Używam pierwszego dostępnego service\'u');
            return services[0];
        }

        return null;
    }

    // Setup characteristics i powiadomień
    async setupCharacteristics(service) {
        const characteristics = await service.getCharacteristics();
        console.log('BluetoothKT210: Characteristics:', characteristics.map(c => c.uuid));

        // Próbuj znaleźć characteristic z temperaturą
        for (const char of characteristics) {
            console.log('BluetoothKT210: Sprawdzam characteristic:', char.uuid, 'properties:', char.properties);

            // Sprawdź czy characteristic obsługuje powiadomienia
            if (char.properties.notify) {
                console.log('BluetoothKT210: Znaleziono characteristic z powiadomieniami:', char.uuid);
                this.characteristic = char;

                // Załącz powiadomienia
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', (e) => {
                    this.handleNotification(e);
                });
                console.log('BluetoothKT210: Powiadomienia włączone');
                return;
            }

            // Sprawdź czy characteristic obsługuje odczyt
            if (char.properties.read) {
                console.log('BluetoothKT210: Znaleziono characteristic do odczytu:', char.uuid);
                this.characteristic = char;
            }
        }

        // Jeśli nie znaleziono characteristic z powiadomieniami, użyj polling
        if (this.characteristic && !this.characteristic.properties.notify) {
            console.log('BluetoothKT210: Używam trybu polling');
            this.startPolling();
        }
    }

    // Obsługa powiadomień z urządzenia
    handleNotification(event) {
        const value = event.target.value;
        this.parseTemperature(value);
    }

    // Parsuj dane temperatury
    parseTemperature(dataView) {
        console.log('BluetoothKT210: Otrzymano dane:', dataView);

        try {
            let temp = null;

            // Spróbuj różnych formatów danych

            // Format 1: Standardowy ESS Temperature (INT16)
            if (dataView.byteLength >= 2) {
                // Sprawdź czy to INT16 (-32768 do 32767)
                const raw = dataView.getInt16(0, true); // little-endian
                // Temperatura w 0.01°C
                if (raw > -3000 && raw < 15000) { // Rozsądny zakres dla kawy
                    temp = raw / 100;
                    console.log('BluetoothKT210: Format ESS INT16, temp:', temp);
                }
            }

            // Format 2: Tuya custom (4 bajty)
            if (temp === null && dataView.byteLength >= 4) {
                const bytes = new Uint8Array(dataView.buffer);
                // Tuya często wysyła: [0x00, 0x00, temp_high, temp_low] lub odwrotnie
                const raw = (bytes[2] << 8) | bytes[3];
                if (raw > 0 && raw < 5000) {
                    temp = raw / 10; // Często 0.1°C
                    console.log('BluetoothKT210: Format Tuya, temp:', temp);
                }
            }

            // Format 3: Prosty INT8 lub UINT8
            if (temp === null && dataView.byteLength >= 1) {
                const raw = dataView.getUint8(0);
                if (raw > 0 && raw < 300) {
                    temp = raw;
                    console.log('BluetoothKT210: Format UINT8, temp:', temp);
                }
            }

            // Format 4: Float 32-bit
            if (temp === null && dataView.byteLength >= 4) {
                temp = dataView.getFloat32(0, true);
                if (temp > 0 && temp < 300) {
                    console.log('BluetoothKT210: Format Float32, temp:', temp);
                } else {
                    temp = null;
                }
            }

            if (temp !== null && !isNaN(temp)) {
                this.temperature = temp;
                console.log('BluetoothKT210: Temperatura:', temp.toFixed(1) + '°C');

                // Wywołaj callback
                if (this.onTemperatureUpdate) {
                    this.onTemperatureUpdate(temp);
                }

                // Zaktualizuj UI
                this.updateUI(temp);
            }

        } catch (error) {
            console.error('BluetoothKT210: Błąd parsowania:', error);
        }
    }

    // Odczytaj temperaturę ręcznie
    async readTemperature() {
        if (!this.characteristic) {
            console.error('BluetoothKT210: Brak characteristic');
            return null;
        }

        try {
            const value = await this.characteristic.readValue();
            this.parseTemperature(value);
            return this.temperature;
        } catch (error) {
            console.error('BluetoothKT210: Błąd odczytu:', error);
            return null;
        }
    }

    // Start polling (dla urządzeń bez powiadomień)
    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            if (this.connected) {
                await this.readTemperature();
            }
        }, 1000); // Co 1 sekundę
    }

    // Stop polling
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // Aktualizuj UI
    updateUI(temp) {
        const tempDisplay = document.getElementById('btTempValue');
        const tempUnit = document.getElementById('btTempUnit');

        if (tempDisplay) {
            tempDisplay.textContent = temp.toFixed(1);
        }

        // Dodaj klasę temperatury dla kolorystyki
        const tempContainer = document.getElementById('btTemperature');
        if (tempContainer) {
            tempContainer.classList.remove('temp-low', 'temp-medium', 'temp-high', 'temp-crack');

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

        // Aktualizuj temperaturę w modalu palenia jeśli jest otwarty
        const roastingTemp = document.getElementById('roastingCurrentTemp');
        if (roastingTemp && document.getElementById('roastingModal').classList.contains('active')) {
            roastingTemp.textContent = temp.toFixed(1) + '°C';
        }
    }

    // Obsługa rozłączenia
    onDisconnected() {
        console.log('BluetoothKT210: Urządzenie rozłączone');
        this.connected = false;
        this.stopPolling();

        // Aktualizuj UI
        const statusEl = document.getElementById('btStatus');
        const tempEl = document.getElementById('btTemperature');

        if (statusEl) {
            statusEl.textContent = 'Rozłączono';
            statusEl.className = 'bt-status disconnected';
        }

        if (tempEl) {
            tempEl.classList.add('disconnected');
        }

        // Pokaż przycisk ponownego połączenia
        const reconnectBtn = document.getElementById('btReconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.style.display = 'inline-flex';
        }

        if (this.app) {
            this.app.showToast('Termometr rozłączony', 'warning');
        }
    }

    // Rozłącz
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.stopPolling();
            await this.device.gatt.disconnect();
            this.connected = false;
            console.log('BluetoothKT210: Rozłączono');
        }
    }

    // Pobierz aktualną temperaturę
    getTemperature() {
        return this.temperature;
    }

    // Czy połączony
    isConnected() {
        return this.connected;
    }
}

// Eksportuj dla użycia w app.js
window.BluetoothKT210 = BluetoothKT210;
