// ===== TUYA THERMOMETER SETUP =====
// Nadpisuje metodę setupBluetooth aby używać Tuya Cloud API

(function() {
    const originalSetupBluetooth = CoffeeRoasterApp.prototype.setupBluetooth;
    
    CoffeeRoasterApp.prototype.setupBluetooth = function() {
        const self = this;
        const connectBtn = document.getElementById('btConnectBtn');
        const reconnectBtn = document.getElementById('btReconnectBtn');
        const widget = document.getElementById('bluetoothWidget');
        
        // Zmień tytuł widgeta
        const titleEl = widget?.querySelector('.bt-title span');
        if (titleEl) {
            titleEl.textContent = 'Termometr KT210 (Tuya)';
        }
        
        // Sprawdź czy TuyaThermometer jest dostępny
        if (!window.TuyaThermometer) {
            console.log('TuyaThermometer not loaded, fallback to Web Bluetooth');
            if (originalSetupBluetooth) {
                originalSetupBluetooth.call(this);
            }
            return;
        }
        
        this.bluetooth = new window.TuyaThermometer(this);
        
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
                        // Sukces - ukryj przyciski, pokaż status
                        connectBtn.style.display = 'none';
                        reconnectBtn.style.display = 'none';
                        document.getElementById('btStatus').textContent = 'Połączono';
                        document.getElementById('btStatus').className = 'bt-status connected';
                        document.getElementById('btTemperature').classList.remove('disconnected');
                        widget?.classList.remove('bt-connecting');
                        
                        // Rozpocznij polling (co 2 sekundy)
                        self.bluetooth.startPolling(2000);
                        
                        self.bluetooth.onTemperatureUpdate = function(temp) {
                            self.currentTemp = temp;
                        };
                        
                        self.showToast('Termometr połączony przez Tuya Cloud!', 'success');
                    } else {
                        throw new Error(result.error || 'Błąd połączenia');
                    }
                    
                } catch (error) {
                    console.error('Tuya connection error:', error);
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" fill="currentColor"/></svg> Połącz';
                    document.getElementById('btStatus').textContent = 'Błąd';
                    document.getElementById('btStatus').className = 'bt-status disconnected';
                    widget?.classList.remove('bt-connecting');
                    self.showToast('Błąd: ' + error.message, 'error');
                }
            });
        }
        
        // Reconnect button - to samo co connect
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', async function() {
                connectBtn.click();
            });
        }
    };
})();
