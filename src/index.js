import express from "express";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8081;
const HOST = "0.0.0.0";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ ok: true }));

function validateCNP(cnp){
  if(!cnp || typeof cnp !== 'string' || cnp.length !== 13 || !/^\d{13}$/.test(cnp)) return false;
  const ctrl = '279146358279';
  let sum = 0;
  for(let i=0;i<12;i++) sum += Number(cnp[i]) * Number(ctrl[i]);
  const mod = sum % 11;
  const check = mod === 10 ? 1 : mod;
  return check === Number(cnp[12]);
}

function calcTax({ actiune, tip_suma, suma, procent }){
  const p = (procent ?? 10) / 100; // default 10% dacă nu se dă altfel
  if(actiune === 'materials'){ return { tax: 0, total_net: suma }; }
  if(actiune === 'check'){ return { tax: +(suma*p).toFixed(2) }; }

  if(tip_suma === 'net'){
    const tax = +(suma*p).toFixed(2);
    const total_net = +(suma - tax).toFixed(2);
    return { tax, total_net };
  } else {
    const tax = +(suma*p).toFixed(2);
    const total_brut = +(suma + tax).toFixed(2);
    return { tax, total_brut };
  }
}

async function logAction(row){
  const { error } = await supabase.from("tax_logs").insert([row]);
  if(error) throw error;
}

app.post("/taxe/calculeaza", async (req, res) => {
  try{
    const { cnp, nume, suma, tip_suma, actiune, procent, observatii } = req.body || {};
    if(!actiune || !['clean','dirty','check','materials'].includes(actiune)) {
      return res.status(400).json({ ok:false, message:'Acțiune invalidă' });
    }
    if(!validateCNP(cnp)) {
      return res.status(400).json({ ok:false, message:'CNP invalid' });
    }
    const amount = Number(suma);
    if(!Number.isFinite(amount) || amount <= 0){
      return res.status(400).json({ ok:false, message:'Sumă invalidă' });
    }
    const amount_type = (tip_suma === 'brut') ? 'brut' : 'net';
    const percent = procent != null ? Number(procent) : null;
    if(percent != null && (!Number.isFinite(percent) || percent < 0)) {
      return res.status(400).json({ ok:false, message:'Procent invalid' });
    }

    const result = calcTax({ actiune, tip_suma: amount_type, suma: amount, procent: percent });

    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || null;
    const ua = req.headers["user-agent"] || null;

    await logAction({
      action: actiune,
      cnp,
      name: nume || null,
      amount,
      amount_type,
      percent: percent,
      notes: observatii || null,
      result,
      ip,
      ua
    });

    res.json({ ok:true, ...result });
  } catch (e){
    res.status(500).json({ ok:false, message: e.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Listening on ${HOST}:${PORT}`);
});
