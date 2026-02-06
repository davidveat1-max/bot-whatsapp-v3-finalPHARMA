const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs-extra');
const basicAuth = require('basic-auth');

const app = express();
app.use(express.json());

/* ======================
   CONFIGURACIÓN
====================== */

const PANEL_USER = "admin";
const PANEL_PASS = "1234";

const ADMINS = [
  "5215512345678@c.us"
];

const COMMAND_FILE = "./commands.json";
const BACKUP_DIR = "./backups";

fs.ensureDirSync(BACKUP_DIR);

/* ======================
   AUTH PANEL
====================== */

function auth(req,res,next){
  const user = basicAuth(req);
  if(!user || user.name !== PANEL_USER || user.pass !== PANEL_PASS){
    res.set('WWW-Authenticate','Basic realm="panel"');
    return res.sendStatus(401);
  }
  next();
}

/* ======================
   COMANDOS
====================== */

if(!fs.existsSync(COMMAND_FILE)){
  fs.writeJsonSync(COMMAND_FILE,{menu:"!menu"},{spaces:2});
}

function loadCommands(){
  return fs.readJsonSync(COMMAND_FILE);
}

function saveCommands(data){
  const stamp = Date.now();
  fs.copySync(COMMAND_FILE, `${BACKUP_DIR}/commands-${stamp}.json`);
  fs.writeJsonSync(COMMAND_FILE,data,{spaces:2});
}

/* ======================
   WHATSAPP CLIENT
====================== */

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer:{
    args:['--no-sandbox','--disable-setuid-sandbox']
  }
});

/* ======================
   QR
====================== */

client.on('qr', qr=>{
  console.log("ESCANEA ESTE QR:");
  qrcode.generate(qr,{small:true});
});

/* ======================
   READY
====================== */

client.on('ready', ()=>{
  console.log("BOT V3 LISTO");
});

/* ======================
   RECONEXIÓN
====================== */

client.on('disconnected', ()=>{
  console.log("Reconectando...");
  client.initialize();
});

/* ======================
   DELAY ANTI SPAM
====================== */

function delay(ms){
  return new Promise(r=>setTimeout(r,ms));
}

/* ======================
   MENSAJES
====================== */

client.on('message', async msg=>{

  if(!msg.body.startsWith('!')) return;

  await delay(700);

  const cmd = msg.body.slice(1).split(' ')[0].toLowerCase();
  const commands = loadCommands();

  /* ----- MENU ----- */

  if(cmd === 'menu'){
    return msg.reply(commands.menu);
  }

  /* ----- TODOS ----- */

  if(cmd === 'todos' && msg.from.endsWith('@g.us')){

    if(!ADMINS.includes(msg.author)){
      return msg.reply("Solo admins");
    }

    const chat = await msg.getChat();
    const mentions = chat.participants.map(p=>p.id._serialized);

    return chat.sendMessage(
      "📢 Atención a todos",
      { mentions }
    );
  }

  /* ----- TEXTOS LARGOS ----- */

  if(commands[cmd]){
    return msg.reply(commands[cmd]);
  }

});

/* ======================
   PANEL WEB BONITO
====================== */

app.get('/', auth, (req,res)=>{

  const commands = loadCommands();

  let html = `
  <html>
  <head>
  <title>Panel Bot V3</title>
  <style>
  body{background:#020617;color:white;font-family:Arial;padding:40px}
  h1{color:#22d3ee}
  textarea{width:100%;height:150px;border-radius:12px;padding:12px}
  button{padding:10px 20px;border-radius:10px;background:#22d3ee;border:0}
  .card{background:#0f172a;padding:20px;border-radius:18px;margin-bottom:20px}
  </style>
  </head>
  <body>
  <h1>⚙️ Panel Bot V3</h1>
  `;

  for(const key in commands){
    html += `
      <div class="card">
      <h3>!${key}</h3>
      <textarea id="${key}">${commands[key]}</textarea>
      <button onclick="save('${key}')">Guardar</button>
      </div>
    `;
  }

  html += `
  <script>
  async function save(cmd){
    const text=document.getElementById(cmd).value;
    await fetch('/save',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({cmd,text})
    });
    alert('Guardado');
  }
  </script>
  </body></html>
  `;

  res.send(html);
});

/* ======================
   GUARDAR DESDE PANEL
====================== */

app.post('/save', auth, (req,res)=>{
  const {cmd,text} = req.body;
  const c = loadCommands();
  c[cmd] = text;
  saveCommands(c);
  res.send({ok:true});
});

/* ======================
   VER BACKUPS
====================== */

app.get('/backups', auth, (req,res)=>{
  const files = fs.readdirSync(BACKUP_DIR);
  res.json(files);
});

/* ======================
   START
====================== */

client.initialize();

app.listen(process.env.PORT || 3000, ()=>{
  console.log("Panel activo");
});
