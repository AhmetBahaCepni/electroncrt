const { app, BrowserWindow, ipcMain } = require('electron');
const pkcs11js = require('pkcs11js');
const forge = require('node-forge');
const axios = require('axios');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: __dirname + "/preload.js"
        }
    });
    mainWindow.loadFile("index.html");
});

ipcMain.handle('sign-in', async (code) => {
    try{
        let pkcs11 = new pkcs11js.PKCS11();
        pkcs11.load("C:\\SoftHSM2\\lib\\softhsm2-X64.dll");
        pkcs11.C_Initialize();
        
        let slots = pkcs11.C_GetSlotList(true);
        if (slots.length === 0) throw new Error("HSM bulunamadı!");
        
        let session = pkcs11.C_OpenSession(slots[0], pkcs11js.CKF_RW_SESSION | pkcs11js.CKF_SERIAL_SESSION);
        pkcs11.C_Login(session, 1, "4321");
        
        let objects = pkcs11.C_FindObjectsInit(session, []);
        let obj = pkcs11.C_FindObjects(session);
        pkcs11.C_FindObjectsFinal(session);
        
        if (obj.length === 0) throw new Error("E-İmza sertifikası bulunamadı!");
        
        let certValue = pkcs11.C_GetAttributeValue(session, obj, [
            { type: pkcs11js.CKA_VALUE }
        ])[0].value;
        
        let certPem = "-----BEGIN CERTIFICATE-----\n" + certValue.toString('base64') + "\n-----END CERTIFICATE-----";
        let cert = forge.pki.certificateFromPem(certPem);
        
        let username = cert.subject.getField("CN").value;
        let organization = cert.subject.getField("O").value;
        
        pkcs11.C_Logout(session);
        pkcs11.C_CloseSession(session);
        pkcs11.C_Finalize();

        const response = await fetch("http://localhost:8080/api/auth/verify-code", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: username,
                code: code
            })
        });

        if (!response.ok) throw new Error("API isteği başarısız!");

        const data = await response.json();
        if (!data.success) throw new Error("API doğrulaması başarısız!");
        
        return `Doğrulama başarılı! web sayfasına geri dönebilirsiniz.`;
        } catch (error) {
        return "Hata: " + error.message;
    }
});
