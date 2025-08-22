// api/gemini.js - ¡VERSIÓN FINAL CON STREAMING E IDIOMA!

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const userPrompt = req.body.prompt;
    if (!userPrompt) {
      return res.status(400).json({ error: 'Falta el prompt' });
    }

    const systemInstruction = "You are a helpful and friendly assistant. Always respond in the exact same language as the user's prompt. Do not mix languages unless the user does so first.";
    const finalPrompt = `${systemInstruction}\n\nUser Prompt: "${userPrompt}"`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // Usamos generateContentStream para obtener la respuesta en trozos
    const result = await model.generateContentStream(finalPrompt);

    // Establecemos las cabeceras para indicar que enviaremos un stream de datos
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Recorremos el stream y enviamos cada trozo al frontend
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText); // Enviamos el trozo de texto
    }

    // Cuando el stream termina, cerramos la conexión
    res.end();

  } catch (error) {
    console.error("Error en la función de la API de Gemini (Streaming):", error);
    // Si hay un error, cerramos la conexión. El frontend lo detectará.
    res.end();
  }
};