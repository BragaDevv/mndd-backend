import admin from "firebase-admin";
import fetch from "node-fetch";

export const notificacaoDevocionalMNDD = async () => {
  try {
    const hoje = new Date()
      .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      .replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");

    // 1. Buscar devocional do dia
    const snap = await admin
      .firestore()
      .collection("devocionais_mndd")
      .where("data", "==", hoje)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn("⚠️ Nenhum devocional encontrado para hoje:", hoje);
      return;
    }

    const devocional = snap.docs[0].data() as any;

    // 2. Criar título e corpo
    const titulo = `📖 Devocional: ${devocional.titulo}`;
    const corpo = `${devocional.conteudo?.split("\n")[0] || ""} (${devocional.referencias || ""})`;

    // 3. Buscar tokens
    const usuariosSnap = await admin.firestore().collection("usuarios").get();
    const tokens = usuariosSnap.docs
      .map((doc) => doc.data().expoToken)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));

    if (tokens.length === 0) {
      console.warn("⚠️ Nenhum token válido encontrado.");
      return;
    }

    // 4. Montar mensagens
    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: titulo,
      body: corpo,
      data: { tipo: "devocional_mndd", data: hoje },
    }));

    // 5. Enviar para Expo Push API
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoResponse.json();
    console.log(`📤 Notificação enviada para ${tokens.length} usuários.`, expoResult);

  } catch (error) {
    console.error("❌ Erro ao enviar notificação do devocional MNDD:", error);
  }
};
