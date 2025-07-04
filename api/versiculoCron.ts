import admin from "firebase-admin";
import fetch from "node-fetch";

// Armazena o último dia em que foi executado
let ultimaExecucaoDia: string | null = null;

export async function checarEnviarVersiculo() {
  try {
    const doc = await admin.firestore().collection("configuracoes").doc("versiculo").get();
    const horaSalva = doc.data()?.hora; // formato: "08:00"

    if (!horaSalva) {
      console.log("⚠️ Nenhum horário salvo para envio de versículo.");
      return;
    }

    const agora = new Date();
    agora.setHours(agora.getHours() - 3); // Ajuste UTC-3

    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();

    const [horaAgendada, minutoAgendado] = horaSalva.split(":").map(Number);

    const minutosAgora = horaAtual * 60 + minutoAtual;
    const minutosAgendado = horaAgendada * 60 + minutoAgendado;

    const dataHoje = agora.toISOString().split("T")[0]; // "2025-06-20"

    const dentroDoIntervalo = minutosAgora >= minutosAgendado && minutosAgora < minutosAgendado + 5;

    if (dentroDoIntervalo && ultimaExecucaoDia !== dataHoje) {
      console.log(`⏰ Dentro do intervalo entre ${horaSalva} e ${horaSalva} + 5min (${horaAtual}:${minutoAtual}). Enviando versículo...`);

      const res = await fetch("https://mndd-backend.onrender.com/versiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      console.log("✅ Versículo enviado via cron:", data);

      ultimaExecucaoDia = dataHoje;
    } else {
      console.log(`🕓 Agora (ajustada): ${horaAtual}:${minutoAtual.toString().padStart(2, "0")} | Esperado: ${horaSalva}`);
    }
  } catch (err) {
    console.error("❌ Erro no cronômetro do versículo:", err);
  }
}
