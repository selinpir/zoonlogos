const confidenceValues = [
  "high",
  "medium",
  "low"
];


export function validateTranslationResponse(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Model geçerli bir JSON nesnesi döndürmedi."
    );
  }

  const stringFields = [
    "translation",
    "meaning",
    "explanation",
    "confidence"
  ];

  for (const field of stringFields) {
    if (typeof data[field] !== "string") {
      throw new Error(
        `Model cevabında "${field}" alanı eksik.`
      );
    }
  }

  if (!data.translation.trim()) {
    throw new Error(
      "Model boş çeviri döndürdü."
    );
  }

  if (
    !confidenceValues.includes(
      data.confidence
    )
  ) {
    throw new Error(
      "Geçersiz güven seviyesi döndürüldü."
    );
  }

  return {
    translation:
      data.translation.trim(),

    meaning:
      data.meaning.trim(),

    explanation:
      data.explanation.trim(),

    confidence:
      data.confidence
  };
}