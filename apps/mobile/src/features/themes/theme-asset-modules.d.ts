// Metro resolve .webp/.wav para o id numérico do asset registry; sem esta declaração o
// TypeScript rejeita os imports estáticos usados em assets.ts.
declare module '*.webp' {
  const assetId: number;
  export default assetId;
}

declare module '*.wav' {
  const assetId: number;
  export default assetId;
}
