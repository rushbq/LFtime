
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME } from '../constants';
import { GenerateContentResponseWithGrounding } from "../types";


const getApiKey = (): string | undefined => {
  // In a real build environment (like Vite or CRA), these are typically prefixed (e.g., VITE_API_KEY or REACT_APP_API_KEY)
  // and process.env is replaced at build time.
  // For this exercise, we directly use process.env.API_KEY as per instructions.
  // If process.env is not available (e.g. running in a strict browser JS environment without a build step that handles env vars),
  // this will be undefined.
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  // Fallback or warning if you need to handle it differently for local dev vs. deployed
  // console.warn("API_KEY not found in process.env. Ensure it is set.");
  return undefined; 
};


let ai: GoogleGenAI | null = null;

const initializeAi = (): GoogleGenAI | null => {
  if (ai) return ai;
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Gemini API Key is not configured. Please set the API_KEY environment variable.");
    return null;
  }
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

export const generateGeminiText = async (prompt: string): Promise<string> => {
  const currentAi = initializeAi();
  if (!currentAi) {
    return "Error: Gemini API client not initialized. API Key might be missing.";
  }

  try {
    const response: GenerateContentResponse = await currentAi.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating text with Gemini:", error);
    if (error instanceof Error) {
        return `Error from Gemini: ${error.message}`;
    }
    return "An unknown error occurred while contacting Gemini.";
  }
};

export const generateGeminiTextWithGrounding = async (prompt: string): Promise<GenerateContentResponseWithGrounding> => {
  const currentAi = initializeAi();
   if (!currentAi) {
    return { text: "Error: Gemini API client not initialized. API Key might be missing." };
  }
  try {
     const response = await currentAi.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    });
    // This is a type cast, ensure response structure matches GenerateContentResponseWithGrounding
    return response as GenerateContentResponseWithGrounding;

  } catch (error) {
    console.error("Error generating text with Gemini (with grounding):", error);
     if (error instanceof Error) {
        return { text: `Error from Gemini: ${error.message}` };
    }
    return { text: "An unknown error occurred while contacting Gemini with grounding." };
  }
};
