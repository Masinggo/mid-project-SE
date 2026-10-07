const { cert, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

// Inisialisasi Firebase Admin SDK
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const servingMetadata = {
  "nasi putih": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "dada ayam bakar": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "telur dadar": { servingAmount: 1, servingUnit: "butir", servingLabel: "1 butir", category: "lauk" },
  "telur rebus": { servingAmount: 1, servingUnit: "butir", servingLabel: "1 butir", category: "lauk" },
  "tempe goreng": { servingAmount: 50, servingUnit: "g", servingLabel: "50 g", category: "lauk" },
  "tahu goreng": { servingAmount: 50, servingUnit: "g", servingLabel: "50 g", category: "lauk" },
  "soto ayam": { servingAmount: 1, servingUnit: "porsi", servingLabel: "1 porsi", category: "makanan_utama" },
  "rendang daging sapi": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "gado-gado": { servingAmount: 1, servingUnit: "porsi", servingLabel: "1 porsi", category: "makanan_utama" },
  "bakso sapi kuah": { servingAmount: 1, servingUnit: "porsi", servingLabel: "1 porsi", category: "makanan_utama" },
  "nasi merah (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "ikan kembung bakar (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "ikan tuna matang (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "udang rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "daging sapi rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "sayur bayam (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "sayur sop (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "capcay (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "mie goreng (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "bihun goreng (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "nasi uduk (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "lontong (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "perkedel kentang (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "kentang rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "ubi jalar rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "jagung rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "pisang (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "pepaya (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "roti tawar (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "makanan_utama" },
  "susu full cream (100 ml)": { servingAmount: 100, servingUnit: "ml", servingLabel: "100 ml", category: "minuman" },
  "air putih": { servingAmount: 250, servingUnit: "ml", servingLabel: "250 ml", category: "minuman" },
  "ikan lele goreng (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "dada ayam rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "telur ceplok": { servingAmount: 1, servingUnit: "butir", servingLabel: "1 butir", category: "lauk" },
  "ikan tongkol rebus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "tahu kukus (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "lauk" },
  "apel (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "jeruk (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "kacang tanah panggang (30 g)": { servingAmount: 30, servingUnit: "g", servingLabel: "30 g", category: "camilan" },
  "yogurt plain (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "oatmeal matang (100 g)": { servingAmount: 100, servingUnit: "g", servingLabel: "100 g", category: "camilan" },
  "teh tawar tanpa gula": { servingAmount: 250, servingUnit: "ml", servingLabel: "250 ml", category: "minuman" },
  "kopi hitam tanpa gula": { servingAmount: 240, servingUnit: "ml", servingLabel: "240 ml", category: "minuman" },
  "air kelapa (250 ml)": { servingAmount: 250, servingUnit: "ml", servingLabel: "250 ml", category: "minuman" },
  "jus jeruk 100% (250 ml)": { servingAmount: 250, servingUnit: "ml", servingLabel: "250 ml", category: "minuman" },
  "susu rendah lemak (250 ml)": { servingAmount: 250, servingUnit: "ml", servingLabel: "250 ml", category: "minuman" }
};

const dataMakanan = [
  { name: "nasi putih", calories: 130, protein: 3, fat: 0, carbs: 28 },
  { name: "dada ayam bakar", calories: 165, protein: 31, fat: 4, carbs: 0 },
  { name: "telur dadar", calories: 93, protein: 7, fat: 7, carbs: 1 },
  { name: "telur rebus", calories: 77, protein: 6, fat: 5, carbs: 1 },
  { name: "tempe goreng", calories: 118, protein: 7, fat: 8, carbs: 5 },
  { name: "tahu goreng", calories: 78, protein: 5, fat: 5, carbs: 3 },
  { name: "soto ayam", calories: 312, protein: 21, fat: 13, carbs: 28 },
  { name: "rendang daging sapi", calories: 195, protein: 18, fat: 11, carbs: 6 },
  { name: "gado-gado", calories: 318, protein: 12, fat: 15, carbs: 35 },
  { name: "bakso sapi kuah", calories: 325, protein: 18, fat: 14, carbs: 32 },
  { name: "nasi merah (100 g)", calories: 123, protein: 2.7, fat: 0.9, carbs: 25.6 },
  { name: "ikan kembung bakar (100 g)", calories: 167, protein: 25, fat: 7, carbs: 0 },
  { name: "ikan tuna matang (100 g)", calories: 132, protein: 28, fat: 1, carbs: 0 },
  { name: "udang rebus (100 g)", calories: 99, protein: 24, fat: 0.3, carbs: 0 },
  { name: "daging sapi rebus (100 g)", calories: 250, protein: 26, fat: 15, carbs: 0 },
  { name: "sayur bayam (100 g)", calories: 23, protein: 3, fat: 0.3, carbs: 3.8 },
  { name: "sayur sop (100 g)", calories: 35, protein: 2, fat: 1, carbs: 5 },
  { name: "capcay (100 g)", calories: 65, protein: 2.5, fat: 3, carbs: 8 },
  { name: "mie goreng (100 g)", calories: 190, protein: 6, fat: 8, carbs: 25 },
  { name: "bihun goreng (100 g)", calories: 160, protein: 3, fat: 5, carbs: 26 },
  { name: "nasi uduk (100 g)", calories: 180, protein: 3.5, fat: 6, carbs: 28 },
  { name: "lontong (100 g)", calories: 130, protein: 2.5, fat: 0.3, carbs: 29 },
  { name: "perkedel kentang (100 g)", calories: 180, protein: 3, fat: 10, carbs: 20 },
  { name: "kentang rebus (100 g)", calories: 87, protein: 1.9, fat: 0.1, carbs: 20 },
  { name: "ubi jalar rebus (100 g)", calories: 86, protein: 1.6, fat: 0.1, carbs: 20 },
  { name: "jagung rebus (100 g)", calories: 96, protein: 3.4, fat: 1.5, carbs: 21 },
  { name: "pisang (100 g)", calories: 89, protein: 1.1, fat: 0.3, carbs: 22.8 },
  { name: "pepaya (100 g)", calories: 43, protein: 0.5, fat: 0.3, carbs: 10.8 },
  { name: "roti tawar (100 g)", calories: 265, protein: 9, fat: 3.2, carbs: 49 },
  { name: "susu full cream (100 ml)", calories: 61, protein: 3.2, fat: 3.3, carbs: 4.8 },
  { name: "air putih", calories: 0, protein: 0, fat: 0, carbs: 0 },
  { name: "ikan lele goreng (100 g)", calories: 190, protein: 17, fat: 12, carbs: 0 },
  { name: "dada ayam rebus (100 g)", calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  { name: "telur ceplok", calories: 90, protein: 6.3, fat: 7, carbs: 0.4 },
  { name: "ikan tongkol rebus (100 g)", calories: 144, protein: 26, fat: 4, carbs: 0 },
  { name: "tahu kukus (100 g)", calories: 76, protein: 8, fat: 4.8, carbs: 1.9 },
  { name: "apel (100 g)", calories: 52, protein: 0.3, fat: 0.2, carbs: 13.8 },
  { name: "jeruk (100 g)", calories: 47, protein: 0.9, fat: 0.1, carbs: 11.8 },
  { name: "kacang tanah panggang (30 g)", calories: 176, protein: 7.7, fat: 15.3, carbs: 6 },
  { name: "yogurt plain (100 g)", calories: 61, protein: 3.5, fat: 3.3, carbs: 4.7 },
  { name: "oatmeal matang (100 g)", calories: 71, protein: 2.5, fat: 1.5, carbs: 12 },
  { name: "teh tawar tanpa gula", calories: 0, protein: 0, fat: 0, carbs: 0 },
  { name: "kopi hitam tanpa gula", calories: 2, protein: 0.3, fat: 0, carbs: 0 },
  { name: "air kelapa (250 ml)", calories: 46, protein: 1.7, fat: 0.5, carbs: 9.2 },
  { name: "jus jeruk 100% (250 ml)", calories: 112, protein: 1.7, fat: 0.5, carbs: 25.8 },
  { name: "susu rendah lemak (250 ml)", calories: 115, protein: 8.5, fat: 2.5, carbs: 12.3 }
];

async function seedData() {
  const collectionRef = db.collection("makanan_tkpi");
  const existingFoods = await collectionRef.get();
  const batch = db.batch();
  const existingNames = new Set(
    existingFoods.docs
      .map((foodDoc) => foodDoc.data().name)
      .filter((name) => typeof name === "string")
      .map((name) => name.trim().toLocaleLowerCase())
  );
  const nutritionMetadata = {
    nutritionSource: "Estimasi nilai acuan umum",
    nutritionNote: "Perkiraan untuk takaran yang dicantumkan; nilai aktual bergantung bahan, merek, resep, dan cara memasak.",
  };
  const waterNutritionMetadata = {
    nutritionSource: "Air minum biasa",
    nutritionNote: "Air putih tanpa tambahan mengandung 0 kcal, 0 g protein, 0 g lemak, dan 0 g karbohidrat per 250 ml.",
  };
  let newCount = 0;
  const addedNames = [];

  dataMakanan.forEach((item) => {
    const metadata = servingMetadata[item.name];
    const itemNutritionMetadata = item.name === "air putih" ? waterNutritionMetadata : nutritionMetadata;
    const normalizedName = item.name.trim().toLocaleLowerCase();
    if (existingNames.has(normalizedName)) return;
    batch.set(collectionRef.doc(), {
      ...item,
      ...metadata,
      ...itemNutritionMetadata,
      createdAt: FieldValue.serverTimestamp()
    });
    existingNames.add(normalizedName);
    addedNames.push({ name: item.name, category: metadata.category });
    newCount += 1;
  });

  if (newCount > 0) {
    await batch.commit();
  }
  console.log(`Berhasil menambahkan ${newCount} makanan baru. Makanan yang sudah ada dilewati tanpa perubahan.`);
  console.log(JSON.stringify(addedNames, null, 2));
}

seedData().catch((error) => {
  console.error("Gagal menambahkan data makanan ke Firestore:", error);
  process.exitCode = 1;
});