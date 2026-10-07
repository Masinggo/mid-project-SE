import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, ScrollView
} from 'react-native';
import {
  collection, doc, setDoc, getDoc,
  addDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc,
  where,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebaseConfig';
import AdminPanel from '../components/AdminPanel';

// --- INTERFACE DATA ---
export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  category?: string;
  servingAmount: number;
  servingUnit: 'g' | 'ml' | 'butir' | 'porsi';
  servingLabel: string;
  nutritionSource?: string;
  nutritionNote?: string;
}

type BiologicalSex = 'female' | 'male' | '';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | '';
type MacroRange = { min: number; max: number };
interface DailyNutritionTargets {
  age: number;
  bmi: number;
  bmiLabel: string;
  calories: number;
  protein: MacroRange;
  fat: MacroRange;
  carbs: MacroRange;
}

const ACTIVITY_LEVELS: {
  value: Exclude<ActivityLevel, ''>;
  label: string;
  multiplier: number;
}[] = [
  { value: 'sedentary', label: 'Minim', multiplier: 1.2 },
  { value: 'light', label: 'Ringan', multiplier: 1.375 },
  { value: 'moderate', label: 'Sedang', multiplier: 1.55 },
  { value: 'active', label: 'Aktif', multiplier: 1.725 },
  { value: 'very_active', label: 'Sangat aktif', multiplier: 1.9 },
];

function getAgeFromBirthDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(0);
  birthDate.setHours(0, 0, 0, 0);
  birthDate.setFullYear(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  if (
    now.getMonth() < month - 1 ||
    (now.getMonth() === month - 1 && now.getDate() < day)
  ) age -= 1;
  return age >= 0 ? age : null;
}

function calculateDailyNutritionTargets(
  weight: number,
  height: number,
  age: number,
  sex: Exclude<BiologicalSex, ''>,
  activity: Exclude<ActivityLevel, ''>
): DailyNutritionTargets {
  const bmi = weight / ((height / 100) ** 2);
  const activityMultiplier = ACTIVITY_LEVELS.find((item) => item.value === activity)?.multiplier ?? 1.2;
  const restingEnergy = (10 * weight) + (6.25 * height) - (5 * age) + (sex === 'male' ? 5 : -161);
  const calories = Math.round(restingEnergy * activityMultiplier);
  const protein: MacroRange = {
    min: Math.round(Math.max(weight * 0.8, (calories * 0.1) / 4)),
    max: Math.round((calories * 0.35) / 4),
  };
  const fat: MacroRange = {
    min: Math.round((calories * 0.2) / 9),
    max: Math.round((calories * 0.35) / 9),
  };
  const carbs: MacroRange = {
    min: Math.round((calories * 0.45) / 4),
    max: Math.round((calories * 0.65) / 4),
  };
  return {
    age,
    bmi,
    bmiLabel: bmi < 18.5
      ? 'di bawah rentang dewasa'
      : bmi < 25
        ? 'dalam rentang dewasa'
        : bmi < 30
          ? 'di atas rentang dewasa'
          : 'jauh di atas rentang dewasa',
    calories,
    protein,
    fat,
    carbs,
  };
}

function getRangeStatus(value: number, range: MacroRange): 'low' | 'within' | 'high' {
  if (value < range.min) return 'low';
  if (value > range.max) return 'high';
  return 'within';
}

function getRangeStatusLabel(status: 'low' | 'within' | 'high'): string {
  if (status === 'low') return 'Di bawah kisaran';
  if (status === 'high') return 'Di atas kisaran';
  return 'Dalam kisaran';
}

function MacroTargetRow({
  label,
  consumed,
  range,
}: {
  label: string;
  consumed: number;
  range: MacroRange;
}) {
  const status = getRangeStatus(consumed, range);
  return (
    <View style={styles.targetMacroRow}>
      <View style={styles.targetMacroHeader}>
        <Text style={styles.targetMacroLabel}>{label}</Text>
        <Text style={styles.targetMacroValue}>{consumed.toFixed(1)} g / {range.min}–{range.max} g</Text>
      </View>
      <Text style={[
        styles.targetStatus,
        status === 'within' ? styles.statusWithin : status === 'low' ? styles.statusLow : styles.statusHigh,
      ]}>
        {getRangeStatusLabel(status)}
      </Text>
    </View>
  );
}

interface RecipeIngredient {
  foodId: string;
  name: string;
  amount: number;
  unit: FoodItem['servingUnit'];
  baseAmount: number;
  baseCalories: number;
  baseProtein: number;
  baseFat: number;
  baseCarbs: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface FoodSubmission {
  id: string;
  name: string;
  category: string;
  status: 'pending' | 'rejected' | 'approved';
  rejectionReason?: string;
  replacesFoodId?: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  servings: number;
  ingredients: {
    foodId: string;
    name: string;
    amount: number;
    unit: FoodItem['servingUnit'];
    baseAmount: number;
    baseCalories: number;
    baseProtein: number;
    baseFat: number;
    baseCarbs: number;
  }[];
}

interface MealLog extends FoodItem {
  loggedAt: Date | null;
  portionCount?: number;
  amount?: number;
  amountUnit?: FoodItem['servingUnit'];
  baseAmount?: number;
  baseCalories?: number;
  baseProtein?: number;
  baseFat?: number;
  baseCarbs?: number;
}

interface MealLogState {
  userId: string;
  status: 'loading' | 'loaded' | 'error';
  items: MealLog[];
  error?: string;
}

type AppTab = 'home' | 'history' | 'profile' | 'admin';
const FOOD_CATEGORIES = [
  { value: 'makanan_utama', label: 'Makanan utama' },
  { value: 'lauk', label: 'Lauk' },
  { value: 'camilan', label: 'Camilan' },
  { value: 'minuman', label: 'Minuman' },
] as const;
const ALL_CATEGORIES = 'all';

function getServingInfo(
  data: Record<string, unknown>,
  name: string
): Pick<FoodItem, 'servingAmount' | 'servingUnit' | 'servingLabel'> {
  const unit = data.servingUnit;
  const amount = Number(data.servingAmount);
  if (
    Number.isFinite(amount) && amount > 0 &&
    (unit === 'g' || unit === 'ml' || unit === 'butir' || unit === 'porsi')
  ) {
    return {
      servingAmount: amount,
      servingUnit: unit,
      servingLabel: typeof data.servingLabel === 'string'
        ? data.servingLabel
        : `${amount} ${unit}`,
    };
  }
  const gramMatch = name.match(/\((\d+(?:[.,]\d+)?)\s*g\)/i);
  const mlMatch = name.match(/\((\d+(?:[.,]\d+)?)\s*ml\)/i);
  if (gramMatch) {
    const servingAmount = Number(gramMatch[1].replace(',', '.'));
    return { servingAmount, servingUnit: 'g', servingLabel: `${servingAmount} g (dari nama)` };
  }
  if (mlMatch) {
    const servingAmount = Number(mlMatch[1].replace(',', '.'));
    return { servingAmount, servingUnit: 'ml', servingLabel: `${servingAmount} ml (dari nama)` };
  }
  return {
    servingAmount: 1,
    servingUnit: 'porsi',
    servingLabel: '1 porsi (satuan belum ditetapkan)',
  };
}

function recipeDocumentId(name: string): string {
  const normalized = canonicalFoodName(name);
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'hidangan';
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = Math.imul(hash ^ normalized.charCodeAt(index), 16777619);
  }
  return `recipe-${slug}-${(hash >>> 0).toString(16)}`;
}

function canonicalFoodName(name: string): string {
  const normalized = name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim() || normalized;
}

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const EMPTY_MEAL_LOGS: MealLog[] = [];

export default function Index() {
  // ================= STATE AUTENTIKASI (TETAP SAMA) =================
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // Loading saat tombol ditekan
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminRoleLoading, setAdminRoleLoading] = useState<boolean>(true);

  // ================= STATE DATA PROFIL (TETAP SAMA) =================
  const [profileName, setProfileName] = useState<string>('');
  const [profileWeight, setProfileWeight] = useState<string>('');
  const [profileHeight, setProfileHeight] = useState<string>('');
  const [profileBirthDate, setProfileBirthDate] = useState<string>('');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('');
  const [targetCalories, setTargetCalories] = useState<string>('');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // ================= STATE DATA MAKANAN & ALUR BARU =================
  const [tkpiDatabase, setTkpiDatabase] = useState<FoodItem[]>([]);
  const [foodCategoryFilter, setFoodCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredFoods, setFilteredFoods] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [mealAmount, setMealAmount] = useState<string>('1');
  const [recipeName, setRecipeName] = useState<string>('');
  const [recipeCategory, setRecipeCategory] = useState<string>('makanan_utama');
  const [recipeServings, setRecipeServings] = useState<string>('1');
  const [ingredientSearch, setIngredientSearch] = useState<string>('');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState<boolean>(false);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [revisionOfFoodId, setRevisionOfFoodId] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<{
    userId: string;
    items: FoodSubmission[];
    status: 'loading' | 'loaded' | 'error';
  }>({ userId: '', items: [], status: 'loading' });
  const [submissionError, setSubmissionError] = useState<string>('');
  const [mealLogState, setMealLogState] = useState<MealLogState>({
    userId: '',
    status: 'loading',
    items: [],
  });
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [foodsError, setFoodsError] = useState<string>('');
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string>('');
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingMealAmount, setEditingMealAmount] = useState<string>('');
  const [updatingMealId, setUpdatingMealId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // ================= FUNGSI =================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setDataLoading(!!currentUser);
      setAdminRoleLoading(!!currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        setAdminRoleLoading(false);
        setActiveTab('home');
      } else {
        void getIdTokenResult(currentUser, true)
          .then((token) => {
            if (auth.currentUser?.uid !== currentUser.uid) return;
            const hasAdminRole = token.claims.admin === true;
            setIsAdmin(hasAdminRole);
            if (!hasAdminRole) setActiveTab('home');
          })
          .catch((error) => {
            if (auth.currentUser?.uid !== currentUser.uid) return;
            console.error('Gagal memeriksa role admin:', error);
            setIsAdmin(false);
            setActiveTab('home');
          })
          .finally(() => {
            if (auth.currentUser?.uid === currentUser.uid) setAdminRoleLoading(false);
          });
      }
      setFoodsError('');
      setSubmissionError('');
      setSubmissionState({
        userId: currentUser?.uid || '',
        items: [],
        status: 'loading',
      });
    });
    return unsubscribe;
  }, []);

  const userId = user?.uid;
  useEffect(() => {
    if (!userId) return;
    let isActive = true;

    const fetchUserProfile = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', userId));
        if (isActive && docSnap.exists()) {
          const data = docSnap.data();
          setProfileName(data.name || '');
          setProfileWeight(data.weight?.toString() || '');
          setProfileHeight(data.height?.toString() || '');
          setProfileBirthDate(typeof data.birthDate === 'string' ? data.birthDate : '');
          setBiologicalSex(data.biologicalSex === 'female' || data.biologicalSex === 'male'
            ? data.biologicalSex
            : '');
          setActivityLevel(ACTIVITY_LEVELS.some((level) => level.value === data.activityLevel)
            ? data.activityLevel
            : '');
          setTargetCalories(data.targetCalories?.toString() || '2000');
        }
      } catch (error) {
        console.error('Error mengambil profil:', error);
      }
    };

    void fetchUserProfile();

    const unsubscribeFoods = onSnapshot(
      collection(db, 'makanan_tkpi'),
      (snapshot) => {
        if (!isActive) return;
        const foodsData: FoodItem[] = snapshot.docs.map((foodDoc) => {
          const data = foodDoc.data();
          return {
            id: foodDoc.id,
            name: data.name || 'Tidak Diketahui',
            calories: Number(data.calories) || 0,
            protein: Number(data.protein) || 0,
            fat: Number(data.fat) || 0,
            carbs: Number(data.carbs) || 0,
            category: typeof data.category === 'string' ? data.category : undefined,
            nutritionSource: typeof data.nutritionSource === 'string' ? data.nutritionSource : undefined,
            nutritionNote: typeof data.nutritionNote === 'string' ? data.nutritionNote : undefined,
            ...getServingInfo(data, data.name || 'Tidak Diketahui'),
          };
        });
        setTkpiDatabase(foodsData);
        setDataLoading(false);
      },
      (error) => {
        if (!isActive) return;
        console.error('Error mengambil data makanan:', error);
        setFoodsError('Daftar makanan gagal dimuat. Periksa koneksi dan aturan Firestore.');
        setDataLoading(false);
      }
    );

    const mealsQuery = query(
      collection(db, 'users', userId, 'meal_logs'),
      orderBy('loggedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      mealsQuery,
      (snapshot) => {
        if (!isActive) return;
        const logs = snapshot.docs.map((mealDoc) => {
          const data = mealDoc.data({ serverTimestamps: 'estimate' });
          const timestamp = data.loggedAt;
          const name = data.name || 'Makanan';
          const servingInfo = getServingInfo(data, name);
          const baseAmount = Number(data.baseAmount) || servingInfo.servingAmount;
          const legacyMultiplier = Number(data.portionCount) || 1;
          const amountUnit = data.amountUnit === 'g' || data.amountUnit === 'ml' ||
            data.amountUnit === 'butir' || data.amountUnit === 'porsi'
            ? data.amountUnit
            : servingInfo.servingUnit;
          return {
            id: mealDoc.id,
            name,
            calories: Number(data.calories) || 0,
            protein: Number(data.protein) || 0,
            fat: Number(data.fat) || 0,
            carbs: Number(data.carbs) || 0,
            ...servingInfo,
            amount: Number(data.amount) || legacyMultiplier * baseAmount,
            amountUnit,
            baseAmount,
            baseCalories: Number(data.baseCalories) || (Number(data.calories) || 0) / legacyMultiplier,
            baseProtein: Number(data.baseProtein) || (Number(data.protein) || 0) / legacyMultiplier,
            baseFat: Number(data.baseFat) || (Number(data.fat) || 0) / legacyMultiplier,
            baseCarbs: Number(data.baseCarbs) || (Number(data.carbs) || 0) / legacyMultiplier,
            loggedAt: timestamp instanceof Timestamp ? timestamp.toDate() : null,
          };
        });
        setMealLogState({ userId, status: 'loaded', items: logs });
      },
      (error) => {
        if (!isActive) return;
        console.error('Error mengambil riwayat makanan:', error);
        setMealLogState({
          userId,
          status: 'error',
          items: [],
          error: 'Riwayat gagal dimuat. Periksa koneksi dan aturan Firestore.',
        });
      }
    );
    const userSubmissionsQuery = query(
      collection(db, 'food_submissions'),
      where('createdBy', '==', userId)
    );
    const unsubscribeSubmissions = onSnapshot(
      userSubmissionsQuery,
      (snapshot) => {
        if (!isActive) return;
        const submissions = snapshot.docs
          .map((submissionDoc): FoodSubmission => {
            const data = submissionDoc.data();
            return {
              id: submissionDoc.id,
              name: String(data.name || ''),
              category: String(data.category || ''),
              status: data.status === 'approved' || data.status === 'rejected'
                ? data.status
                : 'pending',
              rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : '',
              replacesFoodId: typeof data.replacesFoodId === 'string' ? data.replacesFoodId : undefined,
              calories: Number(data.calories) || 0,
              protein: Number(data.protein) || 0,
              fat: Number(data.fat) || 0,
              carbs: Number(data.carbs) || 0,
              servings: Number(data.servings) || 1,
              ingredients: Array.isArray(data.ingredients)
                ? data.ingredients
                  .filter((item: unknown): item is Record<string, unknown> =>
                    typeof item === 'object' && item !== null
                  )
                  .filter((item) =>
                    typeof item.foodId === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.amount === 'number' &&
                    (item.unit === 'g' || item.unit === 'ml' || item.unit === 'butir' || item.unit === 'porsi')
                  )
                  .map((item) => ({
                    foodId: item.foodId as string,
                    name: item.name as string,
                    amount: item.amount as number,
                    unit: item.unit as FoodItem['servingUnit'],
                    baseAmount: Number(item.baseAmount) || 1,
                    baseCalories: Number(item.baseCalories) || 0,
                    baseProtein: Number(item.baseProtein) || 0,
                    baseFat: Number(item.baseFat) || 0,
                    baseCarbs: Number(item.baseCarbs) || 0,
                  }))
                : [],
            };
          });
        setSubmissionState({ userId, items: submissions, status: 'loaded' });
        setSubmissionError('');
      },
      (error) => {
        if (!isActive) return;
        console.error('Gagal memuat pengajuan makanan:', error);
        setSubmissionState({ userId, items: [], status: 'error' });
        setSubmissionError('Pengajuan resep gagal dimuat. Periksa aturan Firestore.');
      }
    );
    return () => {
      isActive = false;
      unsubscribeFoods();
      unsubscribe();
      unsubscribeSubmissions();
    };
  }, [userId]);

  // Proses Login & Register Terpadu
  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Email dan Password wajib diisi!");
      return;
    }
    if (!isLoginMode) {
      if (
        !profileName || !profileWeight || !profileHeight || !targetCalories ||
        !profileBirthDate || !biologicalSex || !activityLevel
      ) {
        Alert.alert("Error", "Harap lengkapi seluruh data diri Anda!");
        return;
      }
      const age = getAgeFromBirthDate(profileBirthDate);
      if (age === null || age < 18 || age > 120) {
        Alert.alert('Tanggal lahir', 'Rekomendasi ini hanya tersedia untuk orang dewasa berusia 18 tahun ke atas. Masukkan tanggal lahir yang valid.');
        return;
      }
      if (
        !Number.isFinite(Number(profileWeight)) || Number(profileWeight) < 20 || Number(profileWeight) > 350 ||
        !Number.isFinite(Number(profileHeight)) || Number(profileHeight) < 100 || Number(profileHeight) > 250 ||
        !Number.isFinite(Number(targetCalories)) || Number(targetCalories) < 500 || Number(targetCalories) > 10000
      ) {
        Alert.alert('Data profil', 'Masukkan berat 20–350 kg, tinggi 100–250 cm, dan target kalori 500–10.000 kcal.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: profileName,
          weight: Number(profileWeight),
          height: Number(profileHeight),
          birthDate: profileBirthDate,
          biologicalSex,
          activityLevel,
          targetCalories: Number(targetCalories),
        });
        Alert.alert("Sukses", "Akun berhasil didaftarkan dan Anda langsung masuk!");
      }
      setEmail(''); setPassword(''); setActiveTab('home');
    } catch (error: any) {
      Alert.alert("Autentikasi Gagal", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProfileName('');
      setProfileWeight('');
      setProfileHeight('');
      setProfileBirthDate('');
      setBiologicalSex('');
      setActivityLevel('');
      setTargetCalories('');
      setIsAdmin(false);
      setPendingDeleteId(null);
      setDeleteError('');
      setActiveTab('home');
    } catch (error) {
      console.error('Gagal logout:', error);
      Alert.alert('Gagal keluar', 'Silakan coba lagi.');
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    const normalizedSearch = text.trim().toLocaleLowerCase();
    setFilteredFoods(normalizedSearch
      ? tkpiDatabase.filter((item) =>
        item.name.toLocaleLowerCase().includes(normalizedSearch) &&
        (foodCategoryFilter === ALL_CATEGORIES || item.category === foodCategoryFilter)
      )
      : []);
  };

  const changeFoodCategory = (category: string) => {
    setFoodCategoryFilter(category);
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    setFilteredFoods(normalizedSearch
      ? tkpiDatabase.filter((item) =>
        item.name.toLocaleLowerCase().includes(normalizedSearch) &&
        (category === ALL_CATEGORIES || item.category === category)
      )
      : []);
  };

  const selectFood = (food: FoodItem) => {
    setSelectedFood(food);
    setMealAmount(String(food.servingAmount));
    setSearchQuery('');
    setFilteredFoods([]);
  };

  const addRecipeIngredient = (food: FoodItem) => {
    setRecipeIngredients((current) => {
      if (current.some((ingredient) => ingredient.foodId === food.id)) return current;
      return [
        ...current,
        {
          foodId: food.id,
          name: food.name,
          amount: food.servingAmount,
          unit: food.servingUnit,
          baseAmount: food.servingAmount,
          baseCalories: food.calories,
          baseProtein: food.protein,
          baseFat: food.fat,
          baseCarbs: food.carbs,
          calories: food.calories,
          protein: food.protein,
          fat: food.fat,
          carbs: food.carbs,
        },
      ];
    });
    setIngredientSearch('');
  };

  const updateRecipeIngredientAmount = (foodId: string, value: string) => {
    const amount = Number(value);
    setRecipeIngredients((current) => current.map((ingredient) => {
      if (ingredient.foodId !== foodId) return ingredient;
      const validAmount = Number.isFinite(amount) && amount > 0 && amount <= 100000;
      const factor = validAmount ? amount / ingredient.baseAmount : 0;
      return {
        ...ingredient,
        amount: value === '' ? 0 : amount,
        calories: Math.round(ingredient.baseCalories * factor * 10) / 10,
        protein: Math.round(ingredient.baseProtein * factor * 10) / 10,
        fat: Math.round(ingredient.baseFat * factor * 10) / 10,
        carbs: Math.round(ingredient.baseCarbs * factor * 10) / 10,
      };
    }));
  };

  const saveRecipeToCatalog = async () => {
    if (!user) return;
    if (submissionState.userId !== user.uid || submissionState.status !== 'loaded') {
      Alert.alert('Pengajuan belum siap', 'Tunggu daftar pengajuan selesai dimuat, lalu coba lagi.');
      return;
    }
    const normalizedName = recipeName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      Alert.alert('Nama makanan', 'Nama makanan harus terdiri dari 2 sampai 80 karakter.');
      return;
    }
    if (!FOOD_CATEGORIES.some((category) => category.value === recipeCategory)) {
      Alert.alert('Kategori makanan', 'Pilih kategori yang tersedia.');
      return;
    }
    if (recipeIngredients.length === 0) {
      Alert.alert('Bahan belum dipilih', 'Tambahkan minimal satu bahan dari database.');
      return;
    }
    if (recipeIngredients.length > 20 || recipeIngredients.some(
      (ingredient) => !Number.isFinite(ingredient.amount)
        || ingredient.amount <= 0
        || ingredient.amount > 100000
    )) {
      Alert.alert('Jumlah bahan tidak valid', 'Setiap bahan harus memiliki jumlah positif yang wajar dalam satuan dasarnya.');
      return;
    }
    const servingCount = Number(recipeServings);
    if (!Number.isFinite(servingCount) || servingCount <= 0 || servingCount > 100) {
      Alert.alert('Jumlah porsi hasil', 'Masukkan jumlah porsi hasil lebih besar dari 0 dan maksimal 100.');
      return;
    }
    const normalizedKey = canonicalFoodName(normalizedName);
    if (tkpiDatabase.some((food) =>
      food.id !== revisionOfFoodId && canonicalFoodName(food.name) === normalizedKey
    )) {
      Alert.alert('Nama sudah digunakan', 'Katalog bersama sudah memiliki makanan dengan nama tersebut.');
      return;
    }
    if (currentSubmissions.some((submission) =>
      submission.id !== editingSubmissionId &&
      submission.id !== revisionOfFoodId &&
      !(submission.status === 'approved' && submission.replacesFoodId === revisionOfFoodId) &&
      canonicalFoodName(submission.name) === normalizedKey
    )) {
      Alert.alert('Nama pengajuan sudah digunakan', 'Anda sudah mengirim hidangan dengan nama tersebut.');
      return;
    }

    const nutrition = recipeIngredients.reduce(
      (total, ingredient) => ({
        calories: total.calories + ingredient.calories,
        protein: total.protein + ingredient.protein,
        fat: total.fat + ingredient.fat,
        carbs: total.carbs + ingredient.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    setIsSavingRecipe(true);
    try {
      const revisionNumber = currentSubmissions.filter(
        (submission) => submission.replacesFoodId === revisionOfFoodId
      ).length + 1;
      const submissionId = editingSubmissionId ||
        (revisionOfFoodId
          ? `${recipeDocumentId(normalizedName)}-revision-${revisionNumber}`
          : recipeDocumentId(normalizedName));
      const payload = {
        name: normalizedName,
        category: recipeCategory,
        servingAmount: 1,
        servingUnit: 'porsi',
        servingLabel: '1 porsi hidangan jadi',
        servings: servingCount,
        calories: Math.round((nutrition.calories / servingCount) * 10) / 10,
        protein: Math.round((nutrition.protein / servingCount) * 10) / 10,
        fat: Math.round((nutrition.fat / servingCount) * 10) / 10,
        carbs: Math.round((nutrition.carbs / servingCount) * 10) / 10,
        nutritionSource: 'Dihitung dari bahan katalog',
        nutritionNote: 'Estimasi per porsi; akurasi bergantung pada data bahan, merek, resep, dan ukuran porsi.',
        ingredients: recipeIngredients.map((ingredient) => ({
          foodId: ingredient.foodId,
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          baseAmount: ingredient.baseAmount,
          baseCalories: ingredient.baseCalories,
          baseProtein: ingredient.baseProtein,
          baseFat: ingredient.baseFat,
          baseCarbs: ingredient.baseCarbs,
        })),
        source: 'user-submission',
        status: 'pending',
        rejectionReason: '',
        ...(revisionOfFoodId ? { replacesFoodId: revisionOfFoodId } : {}),
        createdBy: user.uid,
        ...(!editingSubmissionId ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      };
      if (editingSubmissionId) {
        await updateDoc(doc(db, 'food_submissions', submissionId), payload);
      } else {
        await setDoc(doc(db, 'food_submissions', submissionId), payload);
      }
      setRecipeName('');
      setRecipeCategory('makanan_utama');
      setRecipeServings('1');
      setRecipeIngredients([]);
      setIngredientSearch('');
      setEditingSubmissionId(null);
      setRevisionOfFoodId(null);
      Alert.alert('Dikirim untuk ditinjau', 'Resep tersimpan di Firebase dan akan masuk katalog setelah disetujui admin.');
    } catch (error) {
      console.error('Gagal mengirim pengajuan makanan:', error);
      Alert.alert(
        'Gagal mengirim resep',
        'Resep belum tersimpan. Periksa koneksi dan aturan Firestore untuk food_submissions.'
      );
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const editSubmission = (submission: FoodSubmission) => {
    setEditingSubmissionId(submission.id);
    setRevisionOfFoodId(submission.replacesFoodId || null);
    setRecipeName(submission.name);
    setRecipeCategory(submission.category);
    setRecipeServings(String(submission.servings));
    setRecipeIngredients(submission.ingredients.map((ingredient) => {
      const amount = ingredient.amount;
      const factor = amount / ingredient.baseAmount;
      return {
        ...ingredient,
        calories: Math.round(ingredient.baseCalories * factor * 10) / 10,
        protein: Math.round(ingredient.baseProtein * factor * 10) / 10,
        fat: Math.round(ingredient.baseFat * factor * 10) / 10,
        carbs: Math.round(ingredient.baseCarbs * factor * 10) / 10,
      };
    }));
  };

  const startRecipeRevision = (submission: FoodSubmission) => {
    setEditingSubmissionId(null);
    setRevisionOfFoodId(submission.replacesFoodId || submission.id);
    setRecipeName(submission.name);
    setRecipeCategory(submission.category);
    setRecipeServings(String(submission.servings));
    setRecipeIngredients(submission.ingredients.map((ingredient) => {
      const factor = ingredient.amount / ingredient.baseAmount;
      return {
        ...ingredient,
        calories: Math.round(ingredient.baseCalories * factor * 10) / 10,
        protein: Math.round(ingredient.baseProtein * factor * 10) / 10,
        fat: Math.round(ingredient.baseFat * factor * 10) / 10,
        carbs: Math.round(ingredient.baseCarbs * factor * 10) / 10,
      };
    }));
  };

  const deleteSubmission = async (submissionId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'food_submissions', submissionId));
      if (editingSubmissionId === submissionId) {
        setEditingSubmissionId(null);
        setRevisionOfFoodId(null);
        setRecipeName('');
        setRecipeIngredients([]);
      }
    } catch (error) {
      console.error('Gagal menghapus pengajuan resep:', error);
      setSubmissionError('Pengajuan tidak dapat dihapus. Aturan Firestore hanya mengizinkan pemilik menghapus pengajuan yang belum disetujui.');
    }
  };

  const saveMealEdit = async (meal: MealLog) => {
    if (!user) return;
    const amount = Number(editingMealAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      Alert.alert('Jumlah tidak valid', 'Masukkan jumlah positif yang wajar.');
      return;
    }
    const baseAmount = meal.baseAmount || meal.servingAmount;
    const factor = amount / baseAmount;
    setUpdatingMealId(meal.id);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'meal_logs', meal.id), {
        amount,
        amountUnit: meal.amountUnit || meal.servingUnit,
        portionCount: factor,
        baseAmount,
        baseCalories: meal.baseCalories ?? meal.calories,
        baseProtein: meal.baseProtein ?? meal.protein,
        baseFat: meal.baseFat ?? meal.fat,
        baseCarbs: meal.baseCarbs ?? meal.carbs,
        calories: Math.round((meal.baseCalories ?? meal.calories) * factor * 10) / 10,
        protein: Math.round((meal.baseProtein ?? meal.protein) * factor * 10) / 10,
        fat: Math.round((meal.baseFat ?? meal.fat) * factor * 10) / 10,
        carbs: Math.round((meal.baseCarbs ?? meal.carbs) * factor * 10) / 10,
      });
      setEditingMealId(null);
    } catch (error) {
      console.error('Gagal memperbarui catatan makanan:', error);
      Alert.alert('Gagal memperbarui', 'Catatan belum diperbarui. Periksa aturan Firestore.');
    } finally {
      setUpdatingMealId(null);
    }
  };

  const addFoodToLog = async () => {
    if (!user) return;
    if (!selectedFood) {
      Alert.alert('Pilih makanan', 'Cari dan pilih makanan dari database terlebih dahulu.');
      return;
    }
    const amount = Number(mealAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      Alert.alert('Jumlah tidak valid', 'Masukkan jumlah positif yang wajar sesuai satuan makanan.');
      return;
    }

    setSavingFoodId(selectedFood.id);
    try {
      const factor = amount / selectedFood.servingAmount;
      await addDoc(collection(db, 'users', user.uid, 'meal_logs'), {
        foodId: selectedFood.id,
        name: selectedFood.name,
        servingAmount: selectedFood.servingAmount,
        servingUnit: selectedFood.servingUnit,
        servingLabel: selectedFood.servingLabel,
        amount,
        amountUnit: selectedFood.servingUnit,
        portionCount: factor,
        baseAmount: selectedFood.servingAmount,
        baseCalories: selectedFood.calories,
        baseProtein: selectedFood.protein,
        baseFat: selectedFood.fat,
        baseCarbs: selectedFood.carbs,
        calories: Math.round(selectedFood.calories * factor * 10) / 10,
        protein: Math.round(selectedFood.protein * factor * 10) / 10,
        fat: Math.round(selectedFood.fat * factor * 10) / 10,
        carbs: Math.round(selectedFood.carbs * factor * 10) / 10,
        loggedAt: serverTimestamp(),
      });
      setSelectedFood(null);
      setMealAmount('1');
    } catch (error) {
      console.error('Gagal menyimpan makanan:', error);
      Alert.alert('Gagal menyimpan', 'Makanan belum tersimpan. Periksa koneksi dan aturan Firestore.');
    } finally {
      setSavingFoodId(null);
    }
  };

  const saveProfileDetails = async () => {
    if (!user) return;
    const age = getAgeFromBirthDate(profileBirthDate);
    if (age === null || age < 18 || age > 120) {
      Alert.alert('Tanggal lahir', 'Rekomendasi ini hanya tersedia untuk orang dewasa berusia 18 tahun ke atas. Masukkan tanggal lahir yang valid.');
      return;
    }
    if (
      !biologicalSex || !ACTIVITY_LEVELS.some((level) => level.value === activityLevel) ||
      !Number.isFinite(Number(profileWeight)) || Number(profileWeight) < 20 || Number(profileWeight) > 350 ||
      !Number.isFinite(Number(profileHeight)) || Number(profileHeight) < 100 || Number(profileHeight) > 250 ||
      !Number.isFinite(Number(targetCalories)) || Number(targetCalories) < 500 || Number(targetCalories) > 10000
    ) {
      Alert.alert('Data profil', 'Lengkapi jenis kelamin biologis dan aktivitas, serta masukkan berat 20–350 kg, tinggi 100–250 cm, dan target 500–10.000 kcal.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        weight: Number(profileWeight),
        height: Number(profileHeight),
        birthDate: profileBirthDate,
        biologicalSex,
        activityLevel,
        targetCalories: Number(targetCalories),
      }, { merge: true });
      Alert.alert('Profil tersimpan', 'Data profil dan estimasi kebutuhan gizi sudah diperbarui.');
    } catch (error) {
      console.error('Gagal menyimpan data profil:', error);
      Alert.alert('Gagal menyimpan', 'Profil belum tersimpan. Periksa koneksi dan aturan Firestore.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const deleteMealLog = async (mealId: string) => {
    if (!user) return;
    setDeletingMealId(mealId);
    setDeleteError('');
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'meal_logs', mealId));
      setPendingDeleteId(null);
    } catch (error) {
      console.error('Gagal menghapus catatan makanan:', error);
      setDeleteError('Catatan gagal dihapus. Pastikan aturan Firestore mengizinkan penghapusan milik sendiri.');
    } finally {
      setDeletingMealId(null);
    }
  };

  const currentSubmissions = submissionState.userId === user?.uid &&
    submissionState.status === 'loaded'
    ? submissionState.items
    : [];
  const submissionsLoading = !!user &&
    (submissionState.userId !== user.uid || submissionState.status === 'loading');
  const currentSubmissionError = submissionState.userId === user?.uid
    ? submissionError
    : '';

  const currentMealLogs = mealLogState.userId === user?.uid && mealLogState.status === 'loaded'
    ? mealLogState.items
    : EMPTY_MEAL_LOGS;
  const logsLoading = !!user && mealLogState.userId !== user.uid;
  const logsError = mealLogState.userId === user?.uid && mealLogState.status === 'error'
    ? mealLogState.error
    : '';

  const todayMeals = useMemo(() => {
    const today = dateKey(new Date());
    return currentMealLogs.filter((meal) => meal.loggedAt && dateKey(meal.loggedAt) === today);
  }, [currentMealLogs]);
  const totalCalories = todayMeals.reduce((total, item) => total + item.calories, 0);
  const totalProtein = todayMeals.reduce((total, item) => total + item.protein, 0);
  const totalFat = todayMeals.reduce((total, item) => total + item.fat, 0);
  const totalCarbs = todayMeals.reduce((total, item) => total + item.carbs, 0);
  const profileAge = getAgeFromBirthDate(profileBirthDate);
  const nutritionTargets = profileAge !== null && profileAge >= 18 && profileAge <= 120 &&
    biologicalSex !== '' && activityLevel !== '' &&
    Number(profileWeight) >= 20 && Number(profileHeight) >= 100
    ? calculateDailyNutritionTargets(
      Number(profileWeight),
      Number(profileHeight),
      profileAge,
      biologicalSex,
      activityLevel
    )
    : null;
  const selectedAmount = Number(mealAmount);
  const selectedFoodFactor = selectedFood ? selectedAmount / selectedFood.servingAmount : 0;
  const selectedFoodNutrition = selectedFood && Number.isFinite(selectedAmount) && selectedAmount > 0
    ? {
      calories: Math.round(selectedFood.calories * selectedFoodFactor * 10) / 10,
      protein: Math.round(selectedFood.protein * selectedFoodFactor * 10) / 10,
      fat: Math.round(selectedFood.fat * selectedFoodFactor * 10) / 10,
      carbs: Math.round(selectedFood.carbs * selectedFoodFactor * 10) / 10,
    }
    : null;
  const ingredientSearchResults = ingredientSearch.trim()
    ? tkpiDatabase.filter((food) =>
      food.name.toLocaleLowerCase().includes(ingredientSearch.trim().toLocaleLowerCase())
      && !recipeIngredients.some((ingredient) => ingredient.foodId === food.id)
    ).slice(0, 8)
    : [];
  const recipeNutrition = recipeIngredients.reduce(
    (total, ingredient) => ({
      calories: total.calories + ingredient.calories,
      protein: total.protein + ingredient.protein,
      fat: total.fat + ingredient.fat,
      carbs: total.carbs + ingredient.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
  const recipeServingCount = Number(recipeServings);
  const recipePerServingNutrition = Number.isFinite(recipeServingCount) && recipeServingCount > 0
    ? {
      calories: recipeNutrition.calories / recipeServingCount,
      protein: recipeNutrition.protein / recipeServingCount,
      fat: recipeNutrition.fat / recipeServingCount,
      carbs: recipeNutrition.carbs / recipeServingCount,
    }
    : null;

  const weeklyCalories = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const key = dateKey(day);
      return {
        key,
        label: day.toLocaleDateString('id-ID', { weekday: 'short' }),
        calories: currentMealLogs.reduce(
          (total, meal) => total + (meal.loggedAt && dateKey(meal.loggedAt) === key ? meal.calories : 0),
          0
        ),
      };
    });
  }, [currentMealLogs]);
  const chartGoal = nutritionTargets?.calories ?? (Number(targetCalories) || 2000);
  const chartMax = Math.max(chartGoal, ...weeklyCalories.map((day) => day.calories), 1);

  // ================= TAMPILAN (UI) =================

  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // TAMPILAN 1: LAYAR LOGIN & REGISTER (TETAP SAMA)
  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <ScrollView contentContainerStyle={styles.authScrollContent}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>{isLoginMode ? 'Masuk ke Akun' : 'Daftar Akun Baru'}</Text>
            <TextInput style={styles.authInput} placeholder="Email Mahasiswa" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.authInput} placeholder="Password (Min. 6 Karakter)" value={password} onChangeText={setPassword} secureTextEntry />
            {!isLoginMode && (
              <View style={styles.registerFieldsContainer}>
                <View style={styles.divider} />
                <Text style={styles.subtitleText}>Informasi Profil</Text>
                
                <TextInput
                  style={styles.authInput}
                  placeholder="Nama Lengkap"
                  value={profileName}
                  onChangeText={setProfileName}
                />

                <TextInput
                  style={styles.authInput}
                  placeholder="Tanggal lahir (YYYY-MM-DD)"
                  value={profileBirthDate}
                  onChangeText={setProfileBirthDate}
                  autoCapitalize="none"
                  accessibilityLabel="Tanggal lahir format tahun-bulan-tanggal"
                />
                <Text style={styles.fieldLabel}>Jenis kelamin biologis untuk rumus estimasi</Text>
                <View style={styles.categoryOptions}>
                  {([
                    ['female', 'Perempuan'],
                    ['male', 'Laki-laki'],
                  ] as const).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: biologicalSex === value }}
                      style={[styles.categoryOption, biologicalSex === value && styles.categoryOptionSelected]}
                      onPress={() => setBiologicalSex(value)}
                    >
                      <Text style={[
                        styles.categoryOptionText,
                        biologicalSex === value && styles.categoryOptionTextSelected,
                      ]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Aktivitas fisik mingguan</Text>
                <View style={styles.categoryOptions}>
                  {ACTIVITY_LEVELS.map((level) => (
                    <TouchableOpacity
                      key={level.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: activityLevel === level.value }}
                      style={[styles.categoryOption, activityLevel === level.value && styles.categoryOptionSelected]}
                      onPress={() => setActivityLevel(level.value)}
                    >
                      <Text style={[
                        styles.categoryOptionText,
                        activityLevel === level.value && styles.categoryOptionTextSelected,
                      ]}>{level.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.portionHint}>
                  Estimasi hanya untuk dewasa (18+). Aktivitas: minim hingga sangat aktif.
                </Text>
                
                <View style={styles.rowInputs}>
                  <TextInput style={[styles.authInput, { flex: 1, marginRight: 8 }]} placeholder="Berat (kg)" value={profileWeight} onChangeText={setProfileWeight} keyboardType="numeric" />
                  <TextInput style={[styles.authInput, { flex: 1, marginLeft: 8 }]} placeholder="Tinggi (cm)" value={profileHeight} onChangeText={setProfileHeight} keyboardType="numeric" />
                </View>

                <TextInput
                  style={styles.authInput}
                  placeholder="Target Kalori Harian (Misal: 2000)"
                  value={targetCalories}
                  onChangeText={setTargetCalories}
                  keyboardType="numeric"
                />
              </View>
            )}
            <TouchableOpacity style={styles.authButton} onPress={handleAuth} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.authButtonText}>{isLoginMode ? 'Masuk' : 'Daftar & Simpan'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)}>
              <Text style={styles.authSwitchText}>{isLoginMode ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Masuk di sini'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TAMPILAN 2: APLIKASI UTAMA
  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'home' && (
        <ScrollView contentContainerStyle={styles.screenContent}>
          <View style={styles.greetingRow}>
            <View>
              <Text style={styles.eyebrow}>PEMANTAU GIZI</Text>
              <Text style={styles.greeting}>Halo, {profileName || 'Mahasiswa'} 👋</Text>
              <Text style={styles.mutedText}>Apa yang kamu makan hari ini?</Text>
            </View>
          </View>

          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Kalori hari ini</Text>
            <View style={styles.calorieRow}>
              <Text style={styles.calorieText}>{totalCalories}</Text>
              <Text style={styles.targetText}>/ {targetCalories || '2000'} kcal</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setActiveTab('profile')}
              style={styles.targetLink}
            >
              <Text style={styles.targetLinkText}>Ubah target harian</Text>
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (totalCalories / (Number(targetCalories) || 2000)) * 100)}%` },
                ]}
              />
            </View>
            <View style={styles.macroContainer}>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Protein</Text><Text style={styles.macroValue}>{totalProtein.toFixed(1)}g</Text></View>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Lemak</Text><Text style={styles.macroValue}>{totalFat.toFixed(1)}g</Text></View>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Karbo</Text><Text style={styles.macroValue}>{totalCarbs.toFixed(1)}g</Text></View>
            </View>
          </View>

          {/* === ALUR 1: PILIH KATEGORI === */}
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{paddingHorizontal: 16}}>
              {categoriesList.map((cat, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.categoryBadge, selectedCategory === cat && styles.categoryBadgeActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* === ALUR 2: PILIH MAKANAN === */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={`Cari makanan di ${selectedCategory}...`}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.recommendationCard}>
            <Text style={styles.sectionTitle}>Kebutuhan dan asupan hari ini</Text>
            {nutritionTargets ? (
              <>
                <View style={styles.energyTargetRow}>
                  <View>
                    <Text style={styles.targetCaption}>Estimasi energi pemeliharaan</Text>
                    <Text style={styles.energyTargetValue}>{nutritionTargets.calories} kcal/hari</Text>
                  </View>
                  <Text style={styles.energyIntakeValue}>
                    {totalCalories} kcal · {Math.round((totalCalories / nutritionTargets.calories) * 100)}%
                  </Text>
                </View>
                <Text style={styles.targetCaption}>
                  Persentase menunjukkan perbandingan dengan estimasi, bukan batas maksimum atau target penurunan/kenaikan berat.
                </Text>
                <View style={styles.targetDivider} />
                <MacroTargetRow label="Protein" consumed={totalProtein} range={nutritionTargets.protein} />
                <MacroTargetRow label="Lemak" consumed={totalFat} range={nutritionTargets.fat} />
                <MacroTargetRow label="Karbohidrat" consumed={totalCarbs} range={nutritionTargets.carbs} />
                <Text style={styles.targetCaption}>
                  BMI {nutritionTargets.bmi.toFixed(1)} ({nutritionTargets.bmiLabel}); ini alat skrining, bukan diagnosis.
                </Text>
                <Text style={styles.targetDisclaimer}>
                  Estimasi dewasa non-hamil. Kebutuhan tiap orang berbeda; konsultasikan tenaga kesehatan untuk kondisi khusus.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.mutedText}>
                  Lengkapi tanggal lahir, jenis kelamin biologis, berat, tinggi, dan aktivitas di Profil untuk melihat estimasi kalori serta rentang makro.
                </Text>
                <TouchableOpacity onPress={() => setActiveTab('profile')} style={styles.profileSetupLink}>
                  <Text style={styles.textLink}>Lengkapi profil →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Form makanan hari ini</Text>
            <Text style={styles.mutedText}>
              Pilih makanan dari database, lalu isi jumlah yang dimakan. Nilai gizinya diambil otomatis dari database.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryOptions}>
              {[{ value: ALL_CATEGORIES, label: 'Semua' }, ...FOOD_CATEGORIES].map((category) => (
                <TouchableOpacity
                  key={category.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: foodCategoryFilter === category.value }}
                  style={[
                    styles.categoryOption,
                    foodCategoryFilter === category.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => changeFoodCategory(category.value)}
                >
                  <Text style={[
                    styles.categoryOptionText,
                    foodCategoryFilter === category.value && styles.categoryOptionTextSelected,
                  ]}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari makanan, misalnya nasi..."
              placeholderTextColor="#929A99"
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {dataLoading && <ActivityIndicator color="#16856B" style={styles.loader} />}
            {!!foodsError && <Text style={styles.errorText}>{foodsError}</Text>}
            {filteredFoods.length > 0 && (
              <View style={styles.resultList}>
                {filteredFoods.slice(0, 20).map((item) => (
                  <View style={styles.foodItem} key={item.id}>
                    <View style={styles.foodTextContainer}>
                      <Text style={styles.foodName}>{item.name}</Text>
                      <Text style={styles.foodDetail}>
                        {item.calories} kcal · {item.servingLabel} · P {item.protein}g · L {item.fat}g · K {item.carbs}g
                      </Text>
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Pilih ${item.name}`}
                      style={styles.saveButton}
                      onPress={() => selectFood(item)}
                    >
                      <Text style={styles.saveButtonText}>Pilih</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {!!searchQuery && !dataLoading && filteredFoods.length === 0 && (
              <Text style={styles.emptyText}>Makanan tidak ditemukan.</Text>
            )}

            {selectedFood && (
              <View style={styles.mealFormCard}>
                <View style={styles.selectedFoodHeader}>
                  <View style={styles.foodTextContainer}>
                    <Text style={styles.fieldLabel}>Makanan dipilih</Text>
                    <Text style={styles.foodName}>{selectedFood.name}</Text>
                    <Text style={styles.foodDetail}>
                      Nilai gizi per {selectedFood.servingLabel}: {selectedFood.calories} kcal · P {selectedFood.protein}g · L {selectedFood.fat}g · K {selectedFood.carbs}g
                    </Text>
                    <Text style={styles.portionHint}>
                      {selectedFood.nutritionSource || 'Estimasi acuan'}{selectedFood.nutritionNote ? ` · ${selectedFood.nutritionNote}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Ganti makanan pilihan"
                    onPress={() => setSelectedFood(null)}
                    style={styles.changeFoodButton}
                  >
                    <Text style={styles.textLink}>Ganti</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.fieldLabel}>Jumlah ({selectedFood.servingUnit})</Text>
                <TextInput
                  style={styles.searchInput}
                  value={mealAmount}
                  onChangeText={setMealAmount}
                  keyboardType="decimal-pad"
                  placeholder={`Contoh: ${selectedFood.servingAmount}`}
                  accessibilityLabel={`Jumlah makanan dalam ${selectedFood.servingUnit}`}
                />
                <Text style={styles.portionHint}>
                  Database memakai dasar {selectedFood.servingLabel}. Masukkan jumlah dalam {selectedFood.servingUnit}; gizinya dihitung proporsional.
                </Text>
                {selectedFoodNutrition && (
                  <View style={styles.nutritionPreview}>
                    <Text style={styles.previewTitle}>Perkiraan dari porsi yang diisi</Text>
                    <Text style={styles.previewMacros}>
                      {selectedFoodNutrition.calories} kcal · Protein {selectedFoodNutrition.protein}g · Lemak {selectedFoodNutrition.fat}g · Karbo {selectedFoodNutrition.carbs}g
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.authButton, savingFoodId === selectedFood.id && styles.disabledButton]}
                  onPress={addFoodToLog}
                  disabled={savingFoodId === selectedFood.id}
                >
                  {savingFoodId === selectedFood.id
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.authButtonText}>Simpan ke catatan hari ini</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Buat makanan baru</Text>
            <Text style={styles.mutedText}>
              Contoh: buat “Nasi goreng”, lalu tambahkan nasi, telur, atau ikan dari katalog. Total gizi dihitung dan disimpan ke katalog bersama.
            </Text>
            <View style={styles.mealFormCard}>
              {editingSubmissionId && (
                <View style={styles.editingBanner}>
                  <Text style={styles.editingBannerText}>
                    {revisionOfFoodId ? 'Mengajukan perubahan' : 'Mengedit pengajuan'}: {recipeName}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingSubmissionId(null);
                      setRevisionOfFoodId(null);
                      setRecipeName('');
                      setRecipeCategory('makanan_utama');
                      setRecipeIngredients([]);
                      setRecipeServings('1');
                    }}
                  >
                    <Text style={styles.textLink}>Batal</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.fieldLabel}>Nama makanan</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Contoh: Nasi goreng telur"
                value={recipeName}
                onChangeText={setRecipeName}
                maxLength={80}
                editable={!editingSubmissionId && !revisionOfFoodId}
              />
              {(editingSubmissionId || revisionOfFoodId) && (
                <Text style={styles.portionHint}>Nama dikunci saat mengedit agar pencegahan nama duplikat tetap konsisten.</Text>
              )}
              <Text style={[styles.fieldLabel, styles.categoryLabel]}>Kategori makanan</Text>
              <View style={styles.categoryOptions}>
                {FOOD_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: recipeCategory === category.value }}
                    style={[styles.categoryOption, recipeCategory === category.value && styles.categoryOptionSelected]}
                    onPress={() => setRecipeCategory(category.value)}
                  >
                    <Text style={[
                      styles.categoryOptionText,
                      recipeCategory === category.value && styles.categoryOptionTextSelected,
                    ]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, styles.categoryLabel]}>Hasil resep (jumlah porsi hidangan jadi)</Text>
              <TextInput
                style={styles.searchInput}
                value={recipeServings}
                onChangeText={setRecipeServings}
                keyboardType="decimal-pad"
                placeholder="Contoh: 2"
                accessibilityLabel="Jumlah porsi yang dihasilkan resep"
              />
              <Text style={[styles.fieldLabel, styles.categoryLabel]}>Tambahkan bahan dari database</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari contoh: telur, ikan, nasi..."
                value={ingredientSearch}
                onChangeText={setIngredientSearch}
                editable={!dataLoading}
              />
              {ingredientSearchResults.map((food) => (
                <View style={styles.ingredientSearchResult} key={food.id}>
                  <View style={styles.foodTextContainer}>
                    <Text style={styles.foodName}>{food.name}</Text>
                    <Text style={styles.foodDetail}>
                      {food.calories} kcal per {food.servingLabel} · estimasi
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addIngredientButton}
                    onPress={() => addRecipeIngredient(food)}
                    accessibilityRole="button"
                    accessibilityLabel={`Tambahkan bahan ${food.name}`}
                  >
                    <Text style={styles.addIngredientText}>+ Tambah</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {recipeIngredients.length > 0 && (
                <View style={styles.ingredientsList}>
                  <Text style={styles.previewTitle}>Bahan dan jumlah porsi dasar</Text>
                  {recipeIngredients.map((ingredient) => (
                    <View style={styles.ingredientRow} key={ingredient.foodId}>
                      <View style={styles.foodTextContainer}>
                        <Text style={styles.foodName}>{ingredient.name}</Text>
                        <Text style={styles.foodDetail}>Jumlah dalam {ingredient.unit}</Text>
                        <TextInput
                          style={styles.ingredientQuantity}
                          value={ingredient.amount === 0 ? '' : String(ingredient.amount)}
                          onChangeText={(value) => updateRecipeIngredientAmount(ingredient.foodId, value)}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`Jumlah ${ingredient.name} dalam ${ingredient.unit}`}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.removeIngredientButton}
                        onPress={() => setRecipeIngredients((current) =>
                          current.filter((item) => item.foodId !== ingredient.foodId)
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={`Hapus bahan ${ingredient.name}`}
                      >
                        <Text style={styles.deleteButtonText}>Hapus</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={styles.nutritionPreview}>
                    <Text style={styles.previewTitle}>Gizi per porsi hidangan jadi</Text>
                    {recipePerServingNutrition ? (
                      <Text style={styles.previewMacros}>
                        {Math.round(recipePerServingNutrition.calories * 10) / 10} kcal · Protein {Math.round(recipePerServingNutrition.protein * 10) / 10}g · Lemak {Math.round(recipePerServingNutrition.fat * 10) / 10}g · Karbo {Math.round(recipePerServingNutrition.carbs * 10) / 10}g
                      </Text>
                    ) : (
                      <Text style={styles.errorText}>Jumlah hasil porsi harus lebih besar dari 0.</Text>
                    )}
                  </View>
                </View>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.authButton, isSavingRecipe && styles.disabledButton]}
                onPress={saveRecipeToCatalog}
                disabled={isSavingRecipe}
              >
                {isSavingRecipe
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.authButtonText}>
                    {editingSubmissionId ? 'Simpan perubahan pengajuan' : 'Kirim resep untuk ditinjau'}
                  </Text>}
              </TouchableOpacity>
              <Text style={styles.portionHint}>
                Resep disimpan sebagai pengajuan. Setelah admin meninjau satuan dan nilai gizinya, resep dapat dimasukkan ke katalog bersama.
              </Text>
            </View>
            <View style={styles.submissionList}>
              <Text style={styles.sectionTitle}>Pengajuan resep saya</Text>
              {currentSubmissionError ? (
                <Text style={styles.errorText}>{currentSubmissionError}</Text>
              ) : submissionsLoading ? (
                <ActivityIndicator color="#16856B" style={styles.loader} />
              ) : submissionState.status === 'error' ? (
                <Text style={styles.errorText}>Tidak dapat memuat pengajuan resep.</Text>
              ) : currentSubmissions.length === 0 ? (
                <Text style={styles.mutedText}>Pengajuan yang dikirim untuk ditinjau akan muncul di sini.</Text>
              ) : (
                currentSubmissions.map((submission) => (
                  <View style={styles.submissionItem} key={submission.id}>
                    <View style={styles.foodTextContainer}>
                      <Text style={styles.foodName}>{submission.name}</Text>
                      <Text style={styles.foodDetail}>
                        {submission.calories} kcal per porsi · {submission.ingredients.length} bahan
                      </Text>
                      <Text style={[
                        styles.submissionStatus,
                        submission.status === 'rejected' && styles.submissionRejected,
                      ]}>
                        {submission.status === 'approved'
                          ? 'Disetujui'
                          : submission.status === 'rejected'
                            ? 'Perlu perbaikan'
                            : 'Menunggu tinjauan admin'}
                      </Text>
                      {!!submission.rejectionReason && (
                        <Text style={styles.errorText}>{submission.rejectionReason}</Text>
                      )}
                    </View>
                    {submission.status === 'approved' ? (
                      <View style={styles.submissionButtons}>
                        <TouchableOpacity
                          style={styles.addIngredientButton}
                          onPress={() => startRecipeRevision(submission)}
                        >
                          <Text style={styles.addIngredientText}>Ajukan perubahan</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.submissionButtons}>
                        <TouchableOpacity
                          style={styles.addIngredientButton}
                          onPress={() => editSubmission(submission)}
                        >
                          <Text style={styles.addIngredientText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeIngredientButton}
                          onPress={() => {
                            Alert.alert('Hapus pengajuan?', `Pengajuan “${submission.name}” akan dihapus.`, [
                              { text: 'Batal', style: 'cancel' },
                              { text: 'Hapus', style: 'destructive', onPress: () => void deleteSubmission(submission.id) },
                            ]);
                          }}
                        >
                          <Text style={styles.deleteButtonText}>Hapus</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionTitle}>Catatan hari ini</Text>
              <TouchableOpacity onPress={() => setActiveTab('history')}>
                <Text style={styles.textLink}>Lihat semua</Text>
              </TouchableOpacity>
            </View>
            {logsLoading ? (
              <ActivityIndicator color="#16856B" style={styles.loader} />
            ) : logsError ? (
              <Text style={styles.errorText}>{logsError}</Text>
            ) : todayMeals.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Belum ada catatan</Text>
                <Text style={styles.mutedText}>Cari dan simpan makanan untuk memulai.</Text>
              </View>
            ) : (
              todayMeals.slice(0, 4).map((item) => (
                <View style={styles.foodItem} key={item.id}>
                  <View style={styles.foodTextContainer}>
                    <Text style={styles.foodName}>{item.name}</Text>
                    <Text style={styles.foodDetail}>
                      {item.amount} {item.amountUnit} · {item.loggedAt?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) || 'Menyimpan...'}
                    </Text>
                  </View>
                  <View style={styles.historyActions}>
                    <Text style={styles.logCalories}>{item.calories} kcal</Text>
                    {editingMealId === item.id ? (
                      <View style={styles.mealEditForm}>
                        <TextInput
                          style={styles.ingredientQuantity}
                          value={editingMealAmount}
                          onChangeText={setEditingMealAmount}
                          keyboardType="decimal-pad"
                          accessibilityLabel="Ubah jumlah makanan"
                        />
                        <View style={styles.deleteConfirmRow}>
                          <TouchableOpacity style={styles.cancelDeleteButton} onPress={() => setEditingMealId(null)}>
                            <Text style={styles.cancelDeleteText}>Batal</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.addIngredientButton}
                            onPress={() => void saveMealEdit(item)}
                            disabled={updatingMealId === item.id}
                          >
                            {updatingMealId === item.id
                              ? <ActivityIndicator size="small" color="#16765F" />
                              : <Text style={styles.addIngredientText}>Simpan</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : pendingDeleteId === item.id ? (
                      <View style={styles.deleteConfirmRow}>
                        <TouchableOpacity
                          style={styles.cancelDeleteButton}
                          onPress={() => setPendingDeleteId(null)}
                          disabled={deletingMealId === item.id}
                        >
                          <Text style={styles.cancelDeleteText}>Batal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.confirmDeleteButton}
                          onPress={() => deleteMealLog(item.id)}
                          disabled={deletingMealId === item.id}
                        >
                          {deletingMealId === item.id
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <Text style={styles.confirmDeleteText}>Hapus</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.deleteConfirmRow}>
                        <TouchableOpacity
                          style={styles.addIngredientButton}
                          onPress={() => {
                            setPendingDeleteId(null);
                            setEditingMealId(item.id);
                            setEditingMealAmount(String(item.amount ?? item.servingAmount));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit catatan ${item.name}`}
                        >
                          <Text style={styles.addIngredientText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Hapus catatan ${item.name}`}
                          style={styles.deleteButton}
                          onPress={() => {
                            setDeleteError('');
                            setPendingDeleteId(item.id);
                          }}
                        >
                          <Text style={styles.deleteButtonText}>Hapus</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === 'history' && (
        <ScrollView contentContainerStyle={styles.screenContent}>
          <Text style={styles.eyebrow}>RINGKASAN</Text>
          <Text style={styles.pageTitle}>Riwayat makan</Text>
          <Text style={styles.mutedText}>Pantau asupan kalori selama 7 hari terakhir.</Text>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Kalori per hari</Text>
            <Text style={styles.chartSubtitle}>
              {nutritionTargets ? 'Estimasi kebutuhan harian' : 'Target harian'}: {chartGoal} kcal
            </Text>
            {logsLoading ? (
              <ActivityIndicator color="#16856B" style={styles.loader} />
            ) : logsError ? (
              <Text style={styles.errorText}>{logsError}</Text>
            ) : (
              <View style={styles.chart}>
                {weeklyCalories.map((day) => (
                  <View style={styles.chartColumn} key={day.key}>
                    <Text style={styles.chartValue}>{day.calories || ''}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: day.calories ? Math.max(5, (day.calories / chartMax) * 104) : 3 },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartLabel}>{day.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Semua catatan</Text>
            {!!deleteError && <Text style={styles.errorText}>{deleteError}</Text>}
            {logsLoading ? (
              <ActivityIndicator color="#16856B" style={styles.loader} />
            ) : logsError ? (
              <Text style={styles.errorText}>{logsError}</Text>
            ) : currentMealLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Riwayat masih kosong</Text>
                <Text style={styles.mutedText}>Makanan yang disimpan akan muncul di sini.</Text>
              </View>
            ) : (
              currentMealLogs.map((item, index) => {
                const currentDay = item.loggedAt
                  ? item.loggedAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Mencatat...';
                const previousDay = currentMealLogs[index - 1]?.loggedAt?.toLocaleDateString(
                  'id-ID',
                  { day: 'numeric', month: 'long', year: 'numeric' }
                );
                return (
                  <View key={item.id}>
                    {index === 0 || currentDay !== previousDay ? (
                      <Text style={styles.historyDate}>{currentDay}</Text>
                    ) : null}
                    <View style={styles.foodItem}>
                      <View style={styles.foodTextContainer}>
                        <Text style={styles.foodName}>{item.name}</Text>
                        <Text style={styles.foodDetail}>
                          {item.amount} {item.amountUnit} · {item.loggedAt?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) || 'Menyimpan...'}
                        </Text>
                      </View>
                      <View style={styles.historyActions}>
                        <Text style={styles.logCalories}>{item.calories} kcal</Text>
                        {editingMealId === item.id ? (
                          <View style={styles.mealEditForm}>
                            <TextInput
                              style={styles.ingredientQuantity}
                              value={editingMealAmount}
                              onChangeText={setEditingMealAmount}
                              keyboardType="decimal-pad"
                              accessibilityLabel="Ubah jumlah makanan"
                            />
                            <View style={styles.deleteConfirmRow}>
                              <TouchableOpacity style={styles.cancelDeleteButton} onPress={() => setEditingMealId(null)}>
                                <Text style={styles.cancelDeleteText}>Batal</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.addIngredientButton}
                                onPress={() => void saveMealEdit(item)}
                                disabled={updatingMealId === item.id}
                              >
                                {updatingMealId === item.id
                                  ? <ActivityIndicator size="small" color="#16765F" />
                                  : <Text style={styles.addIngredientText}>Simpan</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : pendingDeleteId === item.id ? (
                          <View style={styles.deleteConfirmRow}>
                            <TouchableOpacity
                              style={styles.cancelDeleteButton}
                              onPress={() => setPendingDeleteId(null)}
                              disabled={deletingMealId === item.id}
                            >
                              <Text style={styles.cancelDeleteText}>Batal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.confirmDeleteButton}
                              onPress={() => deleteMealLog(item.id)}
                              disabled={deletingMealId === item.id}
                            >
                              {deletingMealId === item.id
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : <Text style={styles.confirmDeleteText}>Hapus</Text>}
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.deleteConfirmRow}>
                            <TouchableOpacity
                              style={styles.addIngredientButton}
                              onPress={() => {
                                setPendingDeleteId(null);
                                setEditingMealId(item.id);
                                setEditingMealAmount(String(item.amount ?? item.servingAmount));
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit catatan ${item.name}`}
                            >
                              <Text style={styles.addIngredientText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Hapus catatan ${item.name}`}
                              style={styles.deleteButton}
                              onPress={() => {
                                setDeleteError('');
                                setPendingDeleteId(item.id);
                              }}
                            >
                              <Text style={styles.deleteButtonText}>Hapus</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === 'profile' && (
        <ScrollView contentContainerStyle={styles.screenContent}>
          <Text style={styles.eyebrow}>AKUN</Text>
          <Text style={styles.pageTitle}>Profil</Text>
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(profileName || user.email || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileNameTitle}>{profileName || 'Pengguna'}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Data diri</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Berat badan</Text>
              <TextInput
                style={styles.profileInput}
                value={profileWeight}
                onChangeText={setProfileWeight}
                keyboardType="decimal-pad"
                accessibilityLabel="Berat badan dalam kilogram"
              />
            </View>
            <Text style={[styles.fieldLabel, styles.profileFieldLabel]}>Tanggal lahir (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.searchInput}
              value={profileBirthDate}
              onChangeText={setProfileBirthDate}
              placeholder="Contoh: 2000-05-20"
              autoCapitalize="none"
              accessibilityLabel="Tanggal lahir format tahun-bulan-tanggal"
            />
            <Text style={[styles.fieldLabel, styles.profileFieldLabel]}>Jenis kelamin biologis untuk rumus estimasi</Text>
            <View style={styles.categoryOptions}>
              {([
                ['female', 'Perempuan'],
                ['male', 'Laki-laki'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: biologicalSex === value }}
                  style={[styles.categoryOption, biologicalSex === value && styles.categoryOptionSelected]}
                  onPress={() => setBiologicalSex(value)}
                >
                  <Text style={[
                    styles.categoryOptionText,
                    biologicalSex === value && styles.categoryOptionTextSelected,
                  ]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, styles.profileFieldLabel]}>Aktivitas fisik mingguan</Text>
            <View style={styles.categoryOptions}>
              {ACTIVITY_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activityLevel === level.value }}
                  style={[styles.categoryOption, activityLevel === level.value && styles.categoryOptionSelected]}
                  onPress={() => setActivityLevel(level.value)}
                >
                  <Text style={[
                    styles.categoryOptionText,
                    activityLevel === level.value && styles.categoryOptionTextSelected,
                  ]}>{level.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.portionHint}>
              Hanya untuk usia 18+. Kebutuhan ditaksir untuk dewasa non-hamil; pengguna lama dapat melengkapi data ini di sini.
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tinggi badan</Text>
              <TextInput
                style={styles.profileInput}
                value={profileHeight}
                onChangeText={setProfileHeight}
                keyboardType="decimal-pad"
                accessibilityLabel="Tinggi badan dalam sentimeter"
              />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Target kalori</Text>
              <TextInput
                style={styles.profileInput}
                value={targetCalories}
                onChangeText={setTargetCalories}
                keyboardType="number-pad"
                accessibilityLabel="Target kalori harian"
              />
            </View>
            <TouchableOpacity
              style={[styles.authButton, isSavingProfile && styles.disabledButton]}
              onPress={saveProfileDetails}
              disabled={isSavingProfile}
            >
              {isSavingProfile
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.authButtonText}>Simpan data profil</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.logoutButtonProfile} onPress={handleLogout}>
            <Text style={styles.logoutTextProfile}>Keluar dari akun</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'admin' && isAdmin && !adminRoleLoading && (
        <AdminPanel user={user} />
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <View style={styles.bottomNav}>
        {([
          ['home', 'Beranda', '⌂'],
          ['history', 'Riwayat', '◷'],
          ['profile', 'Profil', '○'],
          ...(isAdmin ? [['admin', 'Admin', '⚙'] as const] : []),
        ] as const).map(([tab, label, icon]) => (
          <TouchableOpacity
            key={tab}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === tab }}
            style={styles.navItem}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.navIcon, activeTab === tab && styles.navTextActive]}>{icon}</Text>
            <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ================= STYLES =================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F5' },
  // Auth Styles
  authContainer: { flex: 1, backgroundColor: '#EAF4EF' },
  authScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  authCard: { width: '88%', maxWidth: 440, backgroundColor: '#FFF', padding: 26, borderRadius: 24, elevation: 5 },
  authTitle: { fontSize: 25, fontWeight: '800', color: '#18352E', marginBottom: 20, textAlign: 'center' },
  authInput: { backgroundColor: '#F4F7F5', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E1E9E4' },
  authButton: { backgroundColor: '#16856B', padding: 15, borderRadius: 13, alignItems: 'center', marginTop: 10 },
  authButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  authSwitchText: { color: '#16856B', marginTop: 15, textAlign: 'center', fontWeight: '600' },
  registerFieldsContainer: { marginTop: 5 },
  fieldLabel: { color: '#52635A', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E7ECE8', marginVertical: 15 },
  subtitleText: { fontSize: 14, fontWeight: 'bold', color: '#666', marginBottom: 10, textAlign: 'center' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  screenContent: { padding: 20, paddingBottom: 28 },
  greetingRow: { marginTop: 8, marginBottom: 18 },
  eyebrow: { color: '#16856B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  greeting: { color: '#18352E', fontSize: 23, fontWeight: '800' },
  mutedText: { color: '#78847E', fontSize: 14, marginTop: 5 },
  pageTitle: { color: '#18352E', fontSize: 27, fontWeight: '800', marginBottom: 2 },
  headerCard: { backgroundColor: '#16765F', padding: 20, borderRadius: 22, marginBottom: 24, elevation: 3 },
  headerTitle: { color: '#D9F1E8', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  calorieRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  calorieText: { color: '#FFF', fontSize: 42, fontWeight: '800', marginRight: 8 },
  targetText: { color: '#D9F1E8', fontSize: 14, fontWeight: '600' },
  targetLink: { alignSelf: 'flex-start', marginTop: -7, marginBottom: 12 },
  targetLinkText: { color: '#D9F1E8', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  progressTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 5, overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', backgroundColor: '#B9F27C', borderRadius: 5 },
  macroContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.12)', padding: 12, borderRadius: 13 },
  macroItem: { alignItems: 'center', flex: 1 },
  macroLabel: { color: '#D9F1E8', fontSize: 12, marginBottom: 3 },
  macroValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  recommendationCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 18, marginBottom: 24, borderWidth: 1, borderColor: '#E2ECE6' },
  energyTargetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  targetCaption: { color: '#78847E', fontSize: 12, lineHeight: 18 },
  energyTargetValue: { color: '#16765F', fontSize: 22, fontWeight: '800', marginTop: 3 },
  energyIntakeValue: { color: '#203B33', fontSize: 13, fontWeight: '700', textAlign: 'right', marginLeft: 8 },
  targetDivider: { height: 1, backgroundColor: '#E7ECE8', marginVertical: 12 },
  targetMacroRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  targetMacroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetMacroLabel: { color: '#203B33', fontSize: 13, fontWeight: '700' },
  targetMacroValue: { color: '#52635A', fontSize: 12, fontWeight: '600' },
  targetStatus: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  statusWithin: { color: '#16856B' },
  statusLow: { color: '#A66B00' },
  statusHigh: { color: '#B42318' },
  targetDisclaimer: { color: '#78847E', fontSize: 11, lineHeight: 16, marginTop: 10 },
  profileSetupLink: { alignSelf: 'flex-start', marginTop: 12 },
  profileFieldLabel: { marginTop: 14 },
  sectionBlock: { marginBottom: 22 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#203B33', marginBottom: 12 },
  textLink: { color: '#16856B', fontWeight: '700', marginBottom: 12 },
  searchInput: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, fontSize: 15, borderWidth: 1, borderColor: '#E4EBE6', color: '#203B33' },
  resultList: { marginTop: 10 },
  mealFormCard: { backgroundColor: '#FFF', padding: 16, marginTop: 12, borderRadius: 17, borderWidth: 1, borderColor: '#DDEBE2' },
  selectedFoodHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  changeFoodButton: { paddingLeft: 8, paddingVertical: 8 },
  portionHint: { color: '#78847E', fontSize: 12, lineHeight: 17, marginTop: 7 },
  nutritionPreview: { backgroundColor: '#F1F7F3', padding: 12, borderRadius: 12, marginTop: 13 },
  previewTitle: { color: '#52635A', fontSize: 12, fontWeight: '700' },
  previewMacros: { color: '#16765F', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 5 },
  categoryLabel: { marginTop: 16 },
  categoryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  categoryOption: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F4F7F5', borderWidth: 1, borderColor: '#E1E9E4' },
  categoryOptionSelected: { backgroundColor: '#E5F3EC', borderColor: '#16856B' },
  categoryOptionText: { color: '#65736B', fontSize: 12, fontWeight: '600' },
  categoryOptionTextSelected: { color: '#16765F', fontWeight: '800' },
  ingredientSearchResult: { flexDirection: 'row', alignItems: 'center', padding: 11, marginTop: 7, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEE9', borderRadius: 12 },
  addIngredientButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: '#E5F3EC' },
  addIngredientText: { color: '#16765F', fontSize: 12, fontWeight: '800' },
  ingredientsList: { marginTop: 16 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', padding: 10, marginTop: 7, backgroundColor: '#F8FAF8', borderRadius: 12, borderWidth: 1, borderColor: '#E8EEE9' },
  ingredientQuantity: { alignSelf: 'flex-start', minWidth: 80, marginTop: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#FFF', color: '#203B33', borderRadius: 8, borderWidth: 1, borderColor: '#DCE7E0' },
  removeIngredientButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFF1F0' },
  editingBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, marginBottom: 12, borderRadius: 11, backgroundColor: '#EAF4EF' },
  editingBannerText: { flex: 1, color: '#16765F', fontSize: 13, fontWeight: '700' },
  submissionList: { marginTop: 20 },
  submissionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, marginTop: 8, borderRadius: 13, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEE9' },
  submissionButtons: { alignItems: 'flex-end', gap: 8 },
  submissionStatus: { color: '#8A6500', fontSize: 11, fontWeight: '700', marginTop: 5 },
  submissionRejected: { color: '#B42318' },
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 15, marginBottom: 9, borderWidth: 1, borderColor: '#E8EEE9' },
  foodTextContainer: { flex: 1, paddingRight: 10 },
  foodName: { fontSize: 15, fontWeight: '700', color: '#203B33' },
  foodDetail: { fontSize: 12, color: '#7B8781', marginTop: 5 },
  saveButton: { backgroundColor: '#16856B', minWidth: 72, minHeight: 38, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  disabledButton: { opacity: 0.65 },
  logCalories: { color: '#16856B', fontWeight: '700', fontSize: 13 },
  emptyCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 15, borderWidth: 1, borderColor: '#E8EEE9' },
  emptyTitle: { color: '#203B33', fontWeight: '700', fontSize: 15 },
  emptyText: { color: '#78847E', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  loader: { marginVertical: 16 },
  errorText: { color: '#B42318', fontSize: 13, marginTop: 10, lineHeight: 19 },
  chartCard: { backgroundColor: '#FFF', marginTop: 20, marginBottom: 25, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#E8EEE9' },
  chartTitle: { color: '#203B33', fontSize: 17, fontWeight: '800' },
  chartSubtitle: { color: '#78847E', fontSize: 12, marginTop: 4 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 22 },
  chartColumn: { alignItems: 'center', flex: 1 },
  chartValue: { color: '#16856B', fontSize: 10, fontWeight: '700', height: 16 },
  barTrack: { height: 108, width: 22, justifyContent: 'flex-end', backgroundColor: '#F0F5F1', borderRadius: 8, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: '#4DB99B', borderRadius: 8 },
  chartLabel: { color: '#78847E', fontSize: 11, marginTop: 8 },
  historyDate: { color: '#16856B', fontSize: 13, fontWeight: '800', marginTop: 7, marginBottom: 9 },
  historyActions: { alignItems: 'flex-end', gap: 7 },
  mealEditForm: { alignItems: 'flex-end', gap: 6 },
  deleteButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FFF1F0' },
  deleteButtonText: { color: '#B42318', fontSize: 12, fontWeight: '700' },
  deleteConfirmRow: { flexDirection: 'row', gap: 6 },
  cancelDeleteButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F1F4F2' },
  cancelDeleteText: { color: '#52635A', fontSize: 11, fontWeight: '700' },
  confirmDeleteButton: { minWidth: 48, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#C43D35' },
  confirmDeleteText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  profileCard: { backgroundColor: '#FFF', alignItems: 'center', padding: 24, borderRadius: 20, marginTop: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E8EEE9' },
  avatarCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#DDF2E9', justifyContent: 'center', alignItems: 'center', marginBottom: 13 },
  avatarText: { color: '#16765F', fontSize: 29, fontWeight: '800' },
  profileNameTitle: { fontSize: 19, fontWeight: '800', color: '#203B33' },
  profileEmail: { fontSize: 13, color: '#78847E', marginTop: 5 },
  infoCard: { backgroundColor: '#FFF', padding: 19, borderRadius: 18, borderWidth: 1, borderColor: '#E8EEE9', marginBottom: 18 },
  infoCardTitle: { fontSize: 16, fontWeight: '800', color: '#203B33', marginBottom: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  infoLabel: { fontSize: 14, color: '#78847E' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#203B33' },
  profileInput: { minWidth: 82, textAlign: 'right', color: '#203B33', backgroundColor: '#F4F7F5', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#E1E9E4' },
  logoutButtonProfile: { backgroundColor: '#FFF', borderColor: '#F2D4D1', borderWidth: 1, padding: 15, borderRadius: 13, alignItems: 'center' },
  logoutTextProfile: { color: '#B42318', fontSize: 15, fontWeight: '700' },
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E8EEE9', paddingBottom: 8, paddingTop: 7 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 },
  navIcon: { color: '#9AA59F', fontSize: 18, fontWeight: '700' },
  navText: { fontSize: 11, color: '#9AA59F', fontWeight: '600' },
  navTextActive: { color: '#16856B', fontWeight: '800' }
});