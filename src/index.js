function fourHoursFromNow(){ 
  const n=new Date(); 
  return new Date(n.getTime() + 4*60*60*1000); 
}

function timeLeftString(until){
  const diff = until.getTime() - Date.now();
  const h = Math.max(0, Math.floor(diff / 3600000));
  const m = Math.max(0, Math.floor((diff % 3600000) / 60000));
  return `${h} ore și ${m} minute`;
}

app.post("/taxe", async (req, res) => {
  try {
    const { cnp, metoda, optiune, gratisFamilie } = req.body;
    if (!cnp || !/^\d{1,6}$/.test(cnp)) return res.status(400).json({ error: "CNP invalid (max 6 cifre)" });

    if (!["card","numerar","transfer","gratis"].includes(metoda))
      return res.status(400).json({ error: "Metodă invalidă" });

    if (!["curat","murdar","otel","praf"].includes(optiune))
      return res.status(400).json({ error: "Opțiune invalidă" });

    let currency = Currency.CLEAN;
    let amount = 0;
    let material = null;
    let familyId = null;

    if (optiune === "curat") { currency = Currency.CLEAN; amount = 40000; }
    if (optiune === "murdar") { currency = Currency.DIRTY; amount = 60000; }
    if (optiune === "otel")   { currency = Currency.MATERIAL; amount = 15; material = "OTEL"; }
    if (optiune === "praf")   { currency = Currency.MATERIAL; amount = 25; material = "PRAF"; }

    // dacă metoda este gratis, asociez familia
    if (metoda === "gratis") {
      if (!gratisFamilie) return res.status(400).json({ error: "Familie necesară la gratis" });
      const fam = await prisma.family.findUnique({ where: { name: gratisFamilie } });
      if (!fam) return res.status(400).json({ error: "Familia selectată nu există" });
      familyId = fam.id;
    }

    const entry = await prisma.taxEntry.create({
      data: {
        type: TaxType.TAXA,
        currency,
        material,
        amount,
        validUntil: fourHoursFromNow(),
        cnp,
        familyId
      }
    });

    res.json({ ok: true, entry });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Eroare server" });
  }
});

app.get("/taxe", async (req,res)=>{
  try {
    const list = await prisma.taxEntry.findMany({
      where: { type: TaxType.TAXA, validUntil: { gt: new Date() } },
      include: { family: true },
      orderBy: { createdAt: "desc" }
    });
    const out = list.map(x => ({
      id: x.id,
      cnp: x.cnp,
      descriere:
        x.currency === "CLEAN" ? "Bani curați"
        : x.currency === "DIRTY" ? "Bani murdari"
        : x.material === "OTEL" ? "Oțel"
        : "Praf de pușcă",
      amount: x.amount,
      remaining: timeLeftString(x.validUntil),
      metoda: x.familyId ? "gratis" : "normal",
      gratisFamilie: x.family ? x.family.name : null
    }));
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// restul endpoint-urilor rămân identice (burghiu, families etc.)
