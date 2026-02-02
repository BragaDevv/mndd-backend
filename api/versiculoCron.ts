// versiculoCron.ts
import admin from "firebase-admin";
import fetch from "node-fetch";

// Armazena o último dia em que foi executado
let ultimaExecucaoDia: string | null = null;

/** Pega data/hora "AGORA" no fuso de São Paulo (America/Sao_Paulo) */
function getNowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  return { year, month, day, hour, minute, second };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export async function checarEnviarVersiculo() {
  try {
    // 1) lê configuração (horário) do Firestore
    const cfgRef = admin.firestore().collection("configuracoes").doc("versiculo");
    const cfgSnap = await cfgRef.get();
    const horaSalva: string | undefined = cfgSnap.data()?.hora; // formato "HH:mm"

    const nowUTC = new Date();
    const sp = getNowInSaoPaulo();

    console.log("[CRON] now UTC:", nowUTC.toISOString());
    console.log("[CRON] now SP :", `${pad2(sp.hour)}:${pad2(sp.minute)}:${pad2(sp.second)}`);
    console.log("[CRON] horaSalva:", horaSalva ?? null);

    if (!horaSalva || !/^\d{2}:\d{2}$/.test(horaSalva)) {
      console.log("⚠️ Nenhum horário válido salvo para envio de versículo (esperado 'HH:mm').");
      return;
    }

    // 2) calcula minutos atuais e minutos agendados
    const [horaAgendada, minutoAgendado] = horaSalva.split(":").map(Number);

    const minutosAgora = sp.hour * 60 + sp.minute;
    const minutosAgendado = horaAgendada * 60 + minutoAgendado;

    // 3) data "hoje" no fuso SP (YYYY-MM-DD)
    const dataHoje = `${sp.year}-${pad2(sp.month)}-${pad2(sp.day)}`;

    // 4) intervalo de 5 minutos para evitar perder por delay
    const dentroDoIntervalo =
      minutosAgora >= minutosAgendado && minutosAgora < minutosAgendado + 5;

    console.log(
      `🕓 Agora: ${pad2(sp.hour)}:${pad2(sp.minute)} | Esperado: ${horaSalva} | dentroDoIntervalo=${dentroDoIntervalo} | ultimaExecucaoDia=${ultimaExecucaoDia} | hoje=${dataHoje}`
    );

    // 5) dispara apenas 1 vez por dia dentro do intervalo
    if (dentroDoIntervalo && ultimaExecucaoDia !== dataHoje) {
      console.log(
        `⏰ Dentro do intervalo (${horaSalva} até ${horaSalva} + 5min). Chamando rota /versiculo...`
      );

      const url = "https://mndd-backend.onrender.com/versiculo";
      console.log("[CRON] POST =>", url);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      console.log("[CRON] resposta status:", res.status);
      console.log("✅ Versículo enviado via cron:", data);

      ultimaExecucaoDia = dataHoje;
      console.log("[CRON] ✅ ultimaExecucaoDia atualizado =>", ultimaExecucaoDia);
      return;
    }

    // se não entrou no intervalo, só loga
    return;
  } catch (err) {
    console.error("❌ Erro no cronômetro do versículo:", err);
  }
}
