import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function isValidExpoToken(t: any): t is string {
  return (
    typeof t === "string" &&
    (t.startsWith("ExpoPushToken[") || t.startsWith("ExponentPushToken["))
  );
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpo(messages: any[]) {
  const chunks = chunkArray(messages, 100); // Expo: até 100 por request
  const results: any[] = [];

  for (const chunk of chunks) {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = resp.status;
    const payload = await resp.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await resp.text()).slice(0, 500),
    }));

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

/** Número do dia (estável) no fuso de São Paulo, para variar a mensagem. */
function diaIndexSP(): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Junta nomes de forma natural: "A", "A e B", "A, B e C". */
function listarNomes(nomes: string[]): string {
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

// Bênçãos variadas para o aniversariante ({nome} é substituído pelo 1º nome).
const BENCAOS_ANIVERSARIO: { title: string; body: string }[] = [
  {
    title: "🎉 Feliz aniversário, {nome}!",
    body: "Que Deus renove suas forças e encha seu novo ano de bênçãos, paz e alegria 🙏🎂",
  },
  {
    title: "🥳 Parabéns, {nome}!",
    body: "Que o Senhor te conceda os desejos do teu coração (Sl 37:4). Um ano abençoado pra você! 🎂",
  },
  {
    title: "🎂 Hoje é o seu dia, {nome}!",
    body: "O Senhor te abençoe e te guarde, e faça resplandecer o Seu rosto sobre você (Nm 6:24-25) 🙏",
  },
  {
    title: "🎈 Feliz aniversário, {nome}!",
    body: "As misericórdias do Senhor se renovam a cada manhã. Que seu novo ano transborde delas! 🎉🎂",
  },
  {
    title: "🌟 Parabéns, {nome}!",
    body: "Que este novo ciclo venha cheio de propósito, saúde e da presença de Deus em cada passo 🎂🙏",
  },
];

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const modoTeste = req.query.teste === "true";

  try {
    const db = admin.firestore();

    // 1️⃣ Busca aniversariantes em usuarios
    const usersSnap = await db.collection("usuarios").get();

    const hoje = new Date();
    const diaHoje = String(hoje.getDate()).padStart(2, "0");
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, "0");

    const aniversariantes: { uid: string; nomeCompleto: string; primeiroNome: string }[] =
      [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const dataNascimento = data.dataNascimento;

      const nome = (data.nome || "").toString().trim();
      const sobrenome = (data.sobrenome || "").toString().trim();

      const nomeCompleto = `${nome} ${sobrenome}`.trim() || "Irmão(a)";
      const primeiroNome = (nomeCompleto.split(" ")[0] || "Irmão(a)").trim();

      if (typeof dataNascimento === "string" && dataNascimento.includes("/")) {
        const [dia, mes] = dataNascimento.split("/");
        if (dia === diaHoje && mes === mesHoje) {
          aniversariantes.push({
            uid: doc.id,
            nomeCompleto,
            primeiroNome,
          });
        }
      }
    }

    console.log("🎂 Aniversariantes hoje:", aniversariantes.map((a) => a.nomeCompleto));

    if (aniversariantes.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Nenhum aniversariante hoje.",
      });
    }

    // 2️⃣ Busca devices logados
    // ⚠️ Para personalizar, é necessário que push_devices tenha o campo `uid`
    const devicesSnap = await db
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    // Monta lista com token + uid (se existir)
    const devices = devicesSnap.docs
      .map((d) => {
        const data = d.data() || {};
        return {
          uid: (data.uid || data.userId || data.ownerUid || null) as string | null,
          expoToken: data.expoToken as any,
        };
      })
      .filter((d) => isValidExpoToken(d.expoToken));

    const totalDevicesLogados = devices.length;

    // Se não houver uid nos devices, não dá pra separar aniversariante vs outros
    const temUidNosDevices = devices.some((d) => !!d.uid);

    if (!temUidNosDevices) {
      return res.status(500).json({
        success: false,
        error:
          "push_devices não possui campo uid (ou userId/ownerUid). Sem isso não é possível enviar push personalizado apenas ao aniversariante.",
        hint:
          "Salve o uid junto do expoToken em push_devices (ex: { uid, expoToken, isLoggedIn }).",
      });
    }

    // 3️⃣ Separa tokens do(s) aniversariante(s) e do restante
    const aniversarianteUids = new Set(aniversariantes.map((a) => a.uid));

    const tokensAniversariantesSet = new Set<string>();
    const tokensOutrosSet = new Set<string>();

    for (const d of devices) {
      if (!d.uid) continue;
      if (aniversarianteUids.has(d.uid)) tokensAniversariantesSet.add(d.expoToken);
      else tokensOutrosSet.add(d.expoToken);
    }

    const tokensAniversariantes = Array.from(tokensAniversariantesSet);
    const tokensOutros = Array.from(tokensOutrosSet);

    console.log("📲 Tokens aniversariantes:", tokensAniversariantes.length);
    console.log("📲 Tokens outros:", tokensOutros.length);

    // 4️⃣ Monta mensagens
    // Push personalizado: 1 por aniversariante (vai para todos os tokens daquele uid)
    // Se houver vários aniversariantes, cada um recebe o próprio texto.
    const devicesByUid = new Map<string, string[]>();
    for (const d of devices) {
      if (!d.uid) continue;
      const arr = devicesByUid.get(d.uid) || [];
      arr.push(d.expoToken);
      devicesByUid.set(d.uid, arr);
    }

    const diaIdx = diaIndexSP();

    const messagesPersonalizados: any[] = [];
    aniversariantes.forEach((a, i) => {
      const tokensDoAniversariante = devicesByUid.get(a.uid) || [];
      // varia a bênção por dia e por aniversariante (estável no dia)
      const bencao =
        BENCAOS_ANIVERSARIO[(diaIdx + i) % BENCAOS_ANIVERSARIO.length];

      for (const token of Array.from(new Set(tokensDoAniversariante))) {
        messagesPersonalizados.push({
          to: token,
          sound: "default",
          title: bencao.title.replace("{nome}", a.primeiroNome),
          body: bencao.body,
          data: {
            type: "aniversario",
            screen: "MNDDScreen",
            params: { abrirAniversario: true },
          },
        });
      }
    });

    // Push geral: para o restante (exclui tokens dos aniversariantes).
    // Agora cita os nomes — mensagem autossuficiente, sem "acesse o app".
    let corpoGeral: string;
    if (aniversariantes.length === 1) {
      corpoGeral = `🎂 Hoje é aniversário de ${aniversariantes[0].nomeCompleto}! Que tal mandar uma mensagem de carinho? 🥳`;
    } else {
      const primeirosNomes = aniversariantes.map((a) => a.primeiroNome);
      const listaTexto =
        primeirosNomes.length <= 4
          ? listarNomes(primeirosNomes)
          : `${primeirosNomes.slice(0, 3).join(", ")} e mais ${primeirosNomes.length - 3}`;
      corpoGeral = `🎂 Hoje ${aniversariantes.length} irmãos fazem aniversário: ${listaTexto}! Celebre com a família MNDD 🥳`;
    }

    const msgGeral = {
      title:
        aniversariantes.length === 1
          ? "🎂 Aniversário hoje!"
          : "🎂 Aniversários hoje!",
      body: corpoGeral,
    };

    const messagesGerais: any[] = tokensOutros.map((token) => ({
      to: token,
      sound: "default",
      title: msgGeral.title,
      body: msgGeral.body,
    }));

    const totalMensagens = messagesPersonalizados.length + messagesGerais.length;

    // 5️⃣ Envio
    if (!modoTeste && totalMensagens > 0) {
      // Você pode enviar separado (melhor pra log)
      await sendExpo(messagesPersonalizados);
      await sendExpo(messagesGerais);
    }

    return res.status(200).json({
      success: true,
      modoTeste,
      totalAniversariantes: aniversariantes.length,
      totalDevicesLogados,
      tokensAniversariantes: tokensAniversariantes.length,
      tokensOutros: tokensOutros.length,
      totalMensagens,
      message: modoTeste
        ? "Modo teste: tokens separados e mensagens montadas."
        : "Notificações enviadas: personalizada para aniversariantes e geral para os demais.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro aniversariantes:", msg);
    return res.status(500).json({ success: false, error: msg });
  }
}
