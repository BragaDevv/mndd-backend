import express, { Request, Response } from "express";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cron from "node-cron";

dotenv.config();

// =====================================================
// ✅ LOGS DE ENV (opcional, mas útil)
// =====================================================
console.log(
  "🔐 Pexels Key:",
  process.env.PEXELS_API_KEY ? "OK" : "NÃO DEFINIDA",
);

// =====================================================
// 🔐 FIREBASE ADMIN INIT (ANTES DOS IMPORTS DE ROTAS)
// =====================================================
const jsonString = process.env.GOOGLE_CREDENTIALS;
if (!jsonString) {
  console.error("❌ GOOGLE_CREDENTIALS não definida.");
  process.exit(1);
}

let serviceAccount: admin.ServiceAccount;
try {
  serviceAccount = JSON.parse(jsonString);
} catch (error) {
  console.error("❌ Erro ao fazer parse das credenciais:", error);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin inicializado.");
}

// =====================================================
// ⬇️ IMPORTS DE ROTAS / HANDLERS (AGORA PODEM USAR FIRESTORE)
// =====================================================
import sendNotificationRouter from "./sendNotification";

import versiculoHoraHandler from "./versiculoHora";
import versiculoHandler from "./versiculo";
import { checarEnviarVersiculo } from "./versiculoCron";
import { versiculoDiaHandler } from "./versiculoDia";

import spotifyHandler from "./spotify";
import rankingHandler from "./ranking";

import cultosAvisoHandler from "./cultosAviso";
import eventosAvisoHandler from "./eventosAviso";

import cifraHandler from "./cifra";

import { salvarDevocionalDiario } from "./saveDevocionalDiario";
import {
  verificarDevocionalMNDDNovo,
  hojeSP_ISO,
} from "./verificarDevocionalMNDDNovo";

import { extrairEstudoHandler } from "./extrairEstudo";
import { renderEstudoCloudinary } from "./renderEstudoCloudinary";

import aniversariantesHandler from "./aniversariantes";

import redefinirSenhaHandler from "./redefinirSenha";
import cortarAssinaturaHandler from "./cortarAssinatura";

import criarUsuarioHandler from "./criarUsuario";
import listarUsuariosHandler from "./listarUsuarios";
import excluirUsuarioHandler from "./excluirUsuario";
import setClaimAdmin from "./setClaimAdmin";

import notificacaoIA from "./notificacaoIA";
import notificarOwnerUsuarioCriado from "./notificarOwnerUsuarioCriado";

import resumoCapituloRouter from "./resumoCapitulo";
import openaiRouter from "./openai";

import pexelsHandler from "./pexels";

import crosswordSeedRouter from "./crosswordSeed";
import crosswordGenerate from "./crosswordGenerate";
import crosswordLeaderHandler from "./crosswordRankingLeader";
import crosswordPublishedHandler from "./crosswordPublishedHandler";
import crosswordRankingLeader from "./crosswordRankingLeader";

import { startGroupsDigestCron } from "./gruposDigest";
startGroupsDigestCron();

// =====================================================
// 🚀 APP
// =====================================================
const app = express();
app.use(bodyParser.json({ limit: "3mb" }));

// =====================================================
// 🌎 CONSTANTES
// =====================================================
const TZ = "America/Sao_Paulo";

// =====================================================
// ✅ ROTAS - NOTIFICAÇÃO MANUAL
// =====================================================
app.use("/", sendNotificationRouter);

// =====================================================
// ✅ ROTAS - VERSÍCULO
// =====================================================
// Versículo do Dia (manual)
app.post("/versiculo", versiculoHandler);

// Salvar horário do versículo (POST e GET)
app.all("/versiculo-hora", versiculoHoraHandler);

// Apenas GET (para segurança e fallback)
app.get("/versiculo-hora", async (_req, res) => {
  try {
    const doc = await admin
      .firestore()
      .collection("configuracoes")
      .doc("versiculo")
      .get();

    const data = doc.data();
    if (data?.hora) return res.status(200).json({ hora: data.hora });
    return res.status(404).json({ error: "Horário não encontrado" });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar horário" });
  }
});

// Versículo do dia (GET) - usado no app
app.get("/api/versiculo-dia", versiculoDiaHandler);

// Rota auxiliar para forçar checagem do versículo (debug)
app.get("/checar", async (_req, res) => {
  await checarEnviarVersiculo();
  return res.send("Versículo checado.");
});

// =====================================================
// ✅ ROTAS - USUÁRIOS ADM (Firebase Auth)
// =====================================================
app.post("/criar-usuario", criarUsuarioHandler);
app.get("/listar-usuarios", listarUsuariosHandler);
app.delete("/excluir-usuario", excluirUsuarioHandler);
app.post("/redefinir-senha", redefinirSenhaHandler);
app.post("/set-claim-admin", setClaimAdmin);

// Notificar owner quando usuário é criado
app.post("/notify/owner/user-created", notificarOwnerUsuarioCriado);

// =====================================================
// ✅ ROTAS - CULTOS / EVENTOS
// =====================================================
app.get("/cultos/avisar", cultosAvisoHandler);
app.get("/eventos/avisar", eventosAvisoHandler);

// =====================================================
// ✅ ROTAS - SPOTIFY / CIFRAS / RANKING
// =====================================================
app.get("/spotify/louvores", spotifyHandler);
app.all("/cifras", cifraHandler);
app.get("/ranking/check", rankingHandler);

// =====================================================
// ✅ ROTAS - PEXELS / ASSINATURA / ESTUDO
// =====================================================
app.get("/api/pexels", pexelsHandler);

app.use("/api", cortarAssinaturaHandler);

app.post("/api/extrair-estudo", extrairEstudoHandler);
app.get("/api/extrair-estudo", extrairEstudoHandler);

app.post("/api/render-estudo", renderEstudoCloudinary);

// =====================================================
// ✅ ROTAS - ANIVERSARIANTES
// =====================================================
app.post("/aniversariantes", aniversariantesHandler);

// =====================================================
// ✅ ROTAS - NOTIF IA (as que você já tem)
// =====================================================
app.use("/", notificacaoIA);

// =====================================================
// ✅ OPENAI
// =====================================================

app.use("/api/openai", openaiRouter);
app.use("/api/openai", resumoCapituloRouter);

//

app.use("/api", crosswordSeedRouter);
app.use("/api", crosswordGenerate);
// rota manual Push Ranking Cruzadas (pra testar pelo navegador/postman)
app.post("/api/crossword/leader-check", crosswordLeaderHandler);

// 🔔 AUTO Push Ranking Cruzadas - Sexta às 11h
cron.schedule(
  "0 11 * * 5",
  async () => {
    try {
      console.log("🕚 Rodando cron da Cruzada (sexta 11h)...");

      await fetch(
        "https://mndd-backend.onrender.com/api/crossword/leader-check",
        { method: "POST" },
      );

      console.log("✅ Cron: checagem de líder da cruzada ok");
    } catch (e) {
      console.log("❌ Cron: falha checagem cruzada", e);
    }
  },
  {
    timezone: "America/Sao_Paulo", // 🔥 MUITO IMPORTANTE
  },
);

// 🔥 ROTA: nova cruzada publicada
app.post("/api/crossword/published-check", crosswordPublishedHandler);

// 👑 ROTA: mudança de liderança
app.post("/api/crossword/leader-check", crosswordRankingLeader);

// =====================================================
// ⏰ CRON JOBS (PADRONIZADOS COM TIMEZONE SP)
// =====================================================

/**
 * DEVOCIONAL IA — gera/salva devocional automaticamente
 * ⏰ Todo dia às 08:05 (SP)
 */
cron.schedule(
  "5 8 * * *",
  async () => {
    console.log("⏰ [CRON] Rodando devocional diário IA (08:05 SP)...");
    try {
      await salvarDevocionalDiario();
      console.log("✅ [CRON] Devocional IA gerado/salvo com sucesso.");
    } catch (err) {
      console.error("❌ [CRON] Erro ao gerar/salvar devocional IA:", err);
    }
  },
  { timezone: TZ },
);

/**
 * DEVOCIONAL IA — rodar manualmente (debug)
 * https://mndd-backend.onrender.com/cron/devocional/run
 */
app.all("/cron/devocional/run", async (_req: Request, res: Response) => {
  try {
    await salvarDevocionalDiario();
    return res.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("❌ Erro ao rodar devocional manual:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Erro" });
  }
});

/**
 * DEVOCIONAL MNDD — verificação + envio de notificação (manual)
 * (checa se existe devocional do dia e notifica)
 */
app.get(
  "/cron/verificar-devocional-mndd",
  async (_req: Request, res: Response) => {
    try {
      const resultado = await verificarDevocionalMNDDNovo();
      res.json({ ok: true, dataHoje: hojeSP_ISO(), ...resultado });
    } catch (err) {
      console.error("❌ Erro na verificação devocional MNDD:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  },
);

/**
 * DEVOCIONAL MNDD — agendamento de notificação
 * ⏰ Todo dia às 08:10 (SP)
 * (roda após o devocional IA das 08:05, dando 5 min de margem)
 */
cron.schedule(
  "10 8 * * *",
  async () => {
    console.log("⏰ [CRON] Verificando devocional MNDD (08:10 SP)...");
    try {
      const resultado = await verificarDevocionalMNDDNovo();
      console.log("📋 [CRON] Resultado devocional MNDD:", resultado);
    } catch (err) {
      console.error("❌ [CRON] Erro ao verificar/enviar devocional MNDD:", err);
    }
  },
  { timezone: TZ },
);

/**
 * ANIVERSARIANTES — envio diário das notificações
 * ⏰ Todo dia às 13:00 (SP)
 *
 * OBS: antes não tinha timezone; agora padronizado.
 */
cron.schedule(
  "0 13 * * *",
  async () => {
    console.log("⏰ [CRON] Rodando aniversariantes do dia (13:00 SP)...");
    try {
      await fetch("https://mndd-backend.onrender.com/aniversariantes", {
        method: "POST",
      });
      console.log("✅ [CRON] Notificações de aniversário enviadas.");
    } catch (error) {
      console.error("❌ [CRON] Erro ao enviar aniversariantes:", error);
    }
  },
  { timezone: TZ },
);

/**
 * RANKING — checagem diária
 * ⏰ Todo dia às 15:00 (SP)
 *
 * OBS: antes dizia "12h Brasília" mas era 15:00 e sem timezone.
 * Agora está claro e consistente.
 */
cron.schedule(
  "0 15 * * *",
  async () => {
    console.log("⏰ [CRON] Rodando checagem de ranking (15:00 SP)...");
    try {
      const response = await fetch(
        "https://mndd-backend.onrender.com/ranking/check",
      );
      const data = await response.text();
      console.log("✅ [CRON] Resultado ranking:", data);
    } catch (error) {
      console.error("❌ [CRON] Erro ao checar ranking:", error);
    }
  },
  { timezone: TZ },
);

// =====================================================
// 🚀 START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT} (TZ=${TZ})`);
});
