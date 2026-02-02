import admin from "firebase-admin";
import fetch from "node-fetch";

let ultimaExecucaoDia: string | null = null;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKeyLocal(d: Date) {
  // dia LOCAL (não UTC)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function checarEnviarVersiculo() {
  try {
    const snapCfg = await admin
      .firestore()
      .collection("configuracoes")
      .doc("versiculo")
      .get();

    const horaSalva = snapCfg.data()?.hora; // "08:00"

    if (!horaSalva) {
      console.log("⚠️ Nenhum horário salvo para envio de versículo.");
      return;
    }

    const agora = new Date();

    // ✅ LOGS para diagnosticar timezone
    console.log("[CRON] now raw:", agora.toString());
    console.log("[CRON] now ISO:", agora.toISOString());
    console.log("[CRON] horaSalva:", horaSalva);

    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();

    const [horaAgendada, minutoAgendado] = horaSalva.split(":").map(Number);

    const minutosAgora = horaAtual * 60 + minutoAtual;
    const minutosAgendado = horaAgendada * 60 + minutoAgendado;

    // janela de 5 min
    const dentroDoIntervalo =
      minutosAgora >= minutosAgendado && minutosAgora < minutosAgendado + 5;

    const dataHoje = dateKeyLocal(agora);

    if (dentroDoIntervalo && ultimaExecucaoDia !== dataHoje) {
      console.log(
        `⏰ Dentro do intervalo ${horaSalva} até +5min. Agora: ${pad2(horaAtual)}:${pad2(minutoAtual)}. Enviando...`
      );

      const res = await fetch("https://mndd-backend.onrender.com/versiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();
      console.log("[CRON] versiculo status:", res.status);
      console.log("[CRON] versiculo body:", text.slice(0, 400));

      if (!res.ok) {
        console.error("❌ Rota /versiculo retornou erro:", res.status);
        // ⚠️ Não marca ultimaExecucaoDia, pra tentar de novo no próximo minuto
        return;
      }

      // se quiser tentar parsear json:
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      console.log("✅ Versículo enviado via cron:", parsed);
      ultimaExecucaoDia = dataHoje;
    } else {
      console.log(
        `🕓 Agora: ${pad2(horaAtual)}:${pad2(minutoAtual)} | Esperado: ${horaSalva} | dentroDoIntervalo=${dentroDoIntervalo} | ultimaExecucaoDia=${ultimaExecucaoDia} | hoje=${dataHoje}`
      );
    }
  } catch (err) {
    console.error("❌ Erro no cronômetro do versículo:", err);
  }
}
