const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs-extra');
const basicAuth = require('basic-auth');

const app = express();
app.use(express.json());

const PANEL_USER = "admin";
const PANEL_PASS = "1234";

const ADMINS = [
  "522462572591@c.us"
];

const COMMAND_FILE = "./commands.json";
const BACKUP_DIR = "./backups";

fs.ensureDirSync(BACKUP_DIR);

function auth(req,res,next){
  const user = basicAuth(req);
  if(!user || user.name !== PANEL_USER || user.pass !== PANEL_PASS){
    res.set('WWW-Authenticate','Basic realm="panel"');
    return res.sendStatus(401);
  }
  next();
}

function loadCommands(){
  return fs.readJsonSync(COMMAND_FILE);
}

function saveCommands(data){
  const stamp = Date.now();
  fs.copySync(COMMAND_FILE, `${BACKUP_DIR}/commands-${stamp}.json`);
  fs.writeJsonSync(COMMAND_FILE,data,{spaces:2});
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer:{
    args:['--no-sandbox','--disable-setuid-sandbox']
  }
});

client.on('qr', qr=>{
  console.log("ESCANEA QR:");
  qrcode.generate(qr,{small:true});
});

client.on('ready', ()=>{
  console.log("BOT LISTO");
});

client.on('disconnected', ()=>{
  client.initialize();
});

function delay(ms){
  return new Promise(r=>setTimeout(r,ms));
}

client.on('message', async msg=>{

  if(!msg.body.startsWith('!')) return;

  await delay(700);

  const cmd = msg.body.slice(1).split(' ')[0].toLowerCase();
  const commands = loadCommands();

  if(cmd === 'menu'){
    return msg.reply(commands.menu);
  }

  if(cmd === 'todos' && msg.from.endsWith('@g.us')){

    if(!ADMINS.includes(msg.author)){
      return msg.reply("Solo admins");
    }

    const chat = await msg.getChat();
    const mentions = chat.participants.map(p=>p.id._serialized);

    return chat.sendMessage("Aviso general",{mentions});
  }

  if(commands[cmd]){
    return msg.reply(commands[cmd]);
  }

});

app.get('/', auth, (req,res)=>{

  const commands = loadCommands();

  let html = `<html><body style="background:#111;color:white;padding:30px">
  <h1>Panel Bot</h1>`;

  for(const key in commands){
    html += `
    <h3>!${key}</h3>
    <textarea id="${key}" style="width:100%;height:120px">${commands[key]}</textarea>
    <button onclick="save('${key}')">Guardar</button>
    <hr>`;
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
    alert('ok');
  }
  </script></body></html>`;

  res.send(html);
});

app.post('/save', auth, (req,res)=>{
  const {cmd,text} = req.body;
  const c = loadCommands();
  c[cmd] = text;
  saveCommands(c);
  res.send({ok:true});
});

client.initialize();

app.listen(process.env.PORT || 3000);
