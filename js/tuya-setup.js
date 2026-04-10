// ===== TUYA THERMOMETER SETUP =====
// Nadpisuje metodę setupBluetooth aby używać Tuya Cloud API

(function() {
    const originalSetupBluetooth = CoffeeRoasterApp.prototype.setupBluetooth;

    CoffeeRoasterApp.prototype.setupBluetooth = function() {
        const self = this;
        const connectBtn = document.getElementById('btConnectBtn');
        const reconnectBtn = document.getElementById('btReconnectBtn');
        const widget = document.getElementById('bluetoothWidget');
        const statusEl = document.getElementById('btStatus');

        // Zmień tytuł widgeta
        const titleEl = widget?.querySelector('.bt-title span');
        if (titleEl) {
            titleEl.textContent = 'Termometr KT210';
        }

        // Sprawdź czy TuyaThermometer jest dostępny
        if (!window.TuyaThermometer) {
            console.log('TuyaThermometer not loaded');
            if (statusEl) {
                statusEl.textContent = 'Moduł nie załadowany';
                statusEl.className = 'bt-status disconnected';
            }
            return;
        }

        this.bluetooth = new window.TuyaThermometer(this);

        // Sprawdź czy działamy lokalnie czy na Vercel
        const isLocalhost = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1' ||
                           window.location.protocol === 'file:';

        if (isLocalhost) {
            if (statusEl) {
                statusEl.textContent = 'Wymaga deploy';
                statusEl.className = 'bt-status';
            }
            if (connectBtn) {
                connectBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.51c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.07 5 7.41 0 2.08-.8 3.97-2.1 5.43z" fill="currentColor"/></svg> Deploy';
                connectBtn.onclick = function() {
                    self.showToast('Aby używać termometru, wgraj aplikację na Vercel', 'info');
                    window.open('https://vercel.com/new', '_blank');
                };
            }
            return;
        }

        // Normalny tryb na Vercel
        if (statusEl) {
            statusEl.textContent = 'Gotowy';
        }

        if (connectBtn) {
            connectBtn.addEventListener('click', async function() {
                try {
                    connectBtn.disabled = true;
                    connectBtn.innerHTML = '<span class="spinner"></span> Łączenie...';
                    document.getElementById('btStatus').textContent = 'Łączenie...';
                    document.getElementById('btStatus').className = 'bt-status';
                    widget?.classList.add('bt-connecting');

                    // Test connection
                    const result = await self.bluetooth.checkConnection();

                    if (result.connected) {
                        // Sukces
                        connectBtn.style.display = 'none';
                        reconnectBtn.style.display = 'none';
                        document.getElementById('btStatus').textContent = 'Połączono';
                        document.getElementById('btStatus').className = 'bt-status connected';
                        document.getElementById('btTemperature').classList.remove('disconnected');
                        widget?.classList.remove('bt-connecting');

                        // Rozpocznij polling
                        self.bluetooth.startPolling(2000);

                        self.bluetooth.onTemperatureUpdate = function(temp) {
                            self.currentTemp = temp;
                        };

                        self.showToast('Termometr połączony!', 'success');

                    } else {
                        throw new Error(result.error || 'Błąd połączenia');
                    }

                } catch (error) {
                    console.error('Tuya connection error:', error);
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" fill="currentColor"/></svg> Połącz';
                    document.getElementById('btStatus').textContent = 'Błąd API';
                    document.getElementById('btStatus').className = 'bt-status disconnected';
                    widget?.classList.remove('bt-connecting');
                    self.showToast('Błąd: ' + error.message, 'error');
                }
            });
        }

        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', async function() {
                connectBtn.click();
            });
        }
    };
})();
