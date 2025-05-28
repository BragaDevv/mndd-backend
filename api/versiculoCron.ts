import admin from "firebase-admin";
import fetch from "node-fetch";

// Evita execução múltipla por minuto
let ultimaExecucao: string | null = null;

export async function checarEEnviarVersiculo() {
  try {
    const doc = await admin.firestore().collection("configuracoes").doc("versiculo").get();
    const horaSalva = doc.data()?.hora;

    if (!horaSalva) return;

    const agora = new Date();
    const horaAtual = agora.toTimeString().slice(0, 5); // Ex: "14:30"

    if (horaAtual === horaSalva && ultimaExecucao !== horaAtual) {
      console.log("⏰ Hora correspondente! Enviando versículo...");

      // Envia para a própria rota
      const res = await fetch("https://mndd-backend.onrender.com/versiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      console.log("✅ Versículo enviado via cron:", data);

      ultimaExecucao = horaAtual;
    }
  } catch (err) {
    console.error("❌ Erro no cronômetro do versículo:", err);
  }
}
