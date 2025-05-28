import admin from "firebase-admin";
import fetch from "node-fetch";

// Garante que o versículo não seja enviado múltiplas vezes no mesmo minuto
let ultimaExecucao: string | null = null;

export async function checarEnviarVersiculo() {
  try {
    // Busca o horário salvo no Firestore
    const doc = await admin.firestore().collection("configuracoes").doc("versiculo").get();
    const horaSalva = doc.data()?.hora; // formato: "HH:mm"

    if (!horaSalva) {
      console.log("⚠️ Nenhum horário salvo para envio de versículo.");
      return;
    }

    const agora = new Date();
    const horaAtual = agora.toTimeString().slice(0, 5); // "HH:mm"

    // Verifica se é o horário programado e se ainda não executou neste minuto
    if (horaAtual === horaSalva && ultimaExecucao !== horaAtual) {
      console.log(`⏰ Hora correspondente (${horaAtual})! Enviando versículo...`);

      const res = await fetch("https://mndd-backend.onrender.com/versiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      console.log("✅ Versículo enviado via cron:", data);

      ultimaExecucao = horaAtual;
    } else {
      console.log(`🕓 Agora: ${horaAtual} | Esperado: ${horaSalva}`);
    }

  } catch (err) {
    console.error("❌ Erro no cronômetro do versículo:", err);
  }
}
