// api/uploadthing.ts
import { createUploadthing, type FileRouter } from "uploadthing/express";

const f = createUploadthing();

export const uploadRouter = {
  estudoPDF: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
  }).onUploadComplete(async ({ file }) => {
    console.log("✅ PDF enviado:", file.url);
    // Você pode salvar no Firestore aqui também, mas o ideal é enviar pro handler separado
  }),
} satisfies FileRouter;
