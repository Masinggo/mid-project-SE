const { cert, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

// Inisialisasi Firebase Admin SDK
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

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
  { name: "susu full cream (100 ml)", calories: 61, protein: 3.2, fat: 3.3, carbs: 4.8 }
];

async function seedData() {
  const collectionRef = db.collection("makanan_tkpi");
  const existingFoods = await collectionRef.get();
  const existingNames = new Set(
    existingFoods.docs.map((doc) => doc.data().name)
  );
  const newFoods = dataMakanan.filter((item) => !existingNames.has(item.name));
  const batch = db.batch();

  newFoods.forEach((item) => {
    const docRef = collectionRef.doc();
    batch.set(docRef, {
      ...item,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  if (newFoods.length > 0) {
    await batch.commit();
  }
  console.log(`Berhasil menambahkan ${newFoods.length} data makanan baru; ${dataMakanan.length - newFoods.length} data dilewati karena sudah ada.`);
}

seedData().catch(console.error);