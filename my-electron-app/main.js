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
    try {
        let pkcs11 = new pkcs11js.PKCS11();
        pkcs11.load("C:\\SoftHSM2\\lib\\softhsm2-X64.dll");
        pkcs11.C_Initialize();

        var module_info = pkcs11.C_GetInfo();
        console.log("Module Info:", module_info);

        // Getting list of slots

        // Getting info about slot
        
        let slots = pkcs11.C_GetSlotList(true);
        if (slots.length === 0) throw new Error("HSM bulunamadı!");
        console.log("Slotlar:", slots);
        console.log("Slot Sayısı:", slots.length);

        let tokenLabels = [];
        for (let i = 0; i < slots.length; i++) {
            let tokenInfo = pkcs11.C_GetTokenInfo(slots[i]);
            let tokenLabel = pkcs11.C_GetTokenInfo(slots[i]).label.trim();
            tokenLabels.push(tokenLabel);
        }
        console.log("Token Labels Array:", tokenLabels);

        let selectedTokenIndex = 0; // list all tokens and select one

        let session = pkcs11.C_OpenSession(slots[selectedTokenIndex], pkcs11js.CKF_RW_SESSION | pkcs11js.CKF_SERIAL_SESSION);
        
        let userPin = "4321"; // input("Enter your PIN: ");

        pkcs11.C_Login(session, 1, userPin);

        let objects = pkcs11.C_FindObjectsInit(session, []);
        console.log("Objects:", objects);
        let obj = pkcs11.C_FindObjects(session);
        console.log("Obj:", obj);

        var nObject = pkcs11.C_CreateObject(session, [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_DATA },
            { type: pkcs11js.CKA_TOKEN, value: false },
            { type: pkcs11js.CKA_PRIVATE, value: false },
            { type: pkcs11js.CKA_LABEL, value: "Hidden data object CKA_LABEL" },
            
        ]);
        console.log("nObject:", nObject);

        pkcs11.C_SetAttributeValue(session, nObject, [{ type: pkcs11js.CKA_LABEL, value: "Hidden data updated object" }]);
        console.log("nObject:", nObject);

        var label = pkcs11.C_GetAttributeValue(session, nObject, [
            { type: pkcs11js.CKA_LABEL },
            { type: pkcs11js.CKA_TOKEN }
        ]);
        console.log(label[0].value.toString());
        console.log(!!label[1].value[0]);

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
