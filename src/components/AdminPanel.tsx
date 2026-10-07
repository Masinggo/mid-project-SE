import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../app/firebaseConfig';

type AdminSubmission = {
  id: string;
  data: Record<string, unknown>;
};

type AdminProfile = {
  id: string;
  data: Record<string, unknown>;
  meals: Record<string, unknown>[];
};

function displayValue(value: unknown, fallback = '-'): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatDate(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString('id-ID');
  }
  return '-';
}

function submissionDate(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

export default function AdminPanel({ user }: { user: User }) {
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [usersSnapshot, submissionsSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'food_submissions')),
      ]);
      const loadedProfiles = await Promise.all(usersSnapshot.docs.map(async (profileDoc) => {
        const mealSnapshot = await getDocs(collection(db, 'users', profileDoc.id, 'meal_logs'));
        return {
          id: profileDoc.id,
          data: profileDoc.data(),
          meals: mealSnapshot.docs.map((mealDoc) => ({
            id: mealDoc.id,
            ...mealDoc.data(),
          })),
        };
      }));
      const loadedSubmissions = submissionsSnapshot.docs
        .map((submissionDoc) => ({ id: submissionDoc.id, data: submissionDoc.data() }))
        .sort((left, right) =>
          submissionDate(right.data.createdAt) - submissionDate(left.data.createdAt)
        );
      setProfiles(loadedProfiles);
      setSubmissions(loadedSubmissions);
    } catch (error) {
      console.error('Gagal memuat data admin:', error);
      setLoadError(
        'Data admin gagal dimuat. Pastikan custom claim admin sudah aktif dan firestore.rules terbaru sudah diterapkan.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAdminData);
  }, [loadAdminData]);

  const approveSubmission = async (submissionId: string) => {
    setProcessingId(submissionId);
    setActionError('');
    try {
      await runTransaction(db, async (transaction) => {
        const submissionRef = doc(db, 'food_submissions', submissionId);
        const submissionSnapshot = await transaction.get(submissionRef);
        if (!submissionSnapshot.exists()) {
          throw new Error('Pengajuan sudah tidak ditemukan.');
        }
        const data = submissionSnapshot.data();
        if (data.status !== 'pending') {
          throw new Error('Hanya pengajuan berstatus menunggu yang dapat disetujui.');
        }

        const replacesFoodId = typeof data.replacesFoodId === 'string'
          ? data.replacesFoodId
          : '';
        const catalogId = replacesFoodId || submissionId;
        const catalogRef = doc(db, 'makanan_tkpi', catalogId);
        const catalogSnapshot = await transaction.get(catalogRef);
        if (replacesFoodId && !catalogSnapshot.exists()) {
          throw new Error('Makanan katalog untuk revisi tidak ditemukan.');
        }
        if (!replacesFoodId && catalogSnapshot.exists()) {
          throw new Error('ID makanan sudah ada di katalog. Periksa kemungkinan duplikat sebelum menyetujui.');
        }

        const previousCatalogData = catalogSnapshot.exists() ? catalogSnapshot.data() : null;
        transaction.set(catalogRef, {
          name: data.name,
          category: data.category,
          servingAmount: data.servingAmount,
          servingUnit: data.servingUnit,
          servingLabel: data.servingLabel,
          calories: data.calories,
          protein: data.protein,
          fat: data.fat,
          carbs: data.carbs,
          ingredients: data.ingredients,
          nutritionSource: data.nutritionSource || 'Dihitung dari bahan katalog',
          nutritionNote: data.nutritionNote ||
            'Estimasi per porsi; nilai aktual bergantung pada data bahan dan resep.',
          createdBy: previousCatalogData?.createdBy || data.createdBy,
          createdAt: previousCatalogData?.createdAt || data.createdAt || serverTimestamp(),
          approvedAt: serverTimestamp(),
        });
        transaction.update(submissionRef, {
          status: 'approved',
          rejectionReason: '',
          updatedAt: serverTimestamp(),
        });
      });
      setRejectionDrafts((current) => {
        const next = { ...current };
        delete next[submissionId];
        return next;
      });
      await loadAdminData();
    } catch (error) {
      console.error('Gagal menyetujui pengajuan:', error);
      setActionError(error instanceof Error ? error.message : 'Pengajuan gagal disetujui.');
    } finally {
      setProcessingId(null);
    }
  };

  const rejectSubmission = async (submissionId: string) => {
    const reason = rejectionDrafts[submissionId]?.trim() || '';
    if (reason.length < 3 || reason.length > 300) {
      setActionError('Alasan penolakan harus berisi 3 sampai 300 karakter.');
      return;
    }
    setProcessingId(submissionId);
    setActionError('');
    try {
      const submissionRef = doc(db, 'food_submissions', submissionId);
      await updateDoc(submissionRef, {
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });
      await loadAdminData();
    } catch (error) {
      console.error('Gagal menolak pengajuan:', error);
      setActionError('Pengajuan gagal ditolak. Periksa aturan Firestore admin.');
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = submissions.filter((submission) => submission.data.status === 'pending').length;
  const approvedCount = submissions.filter((submission) => submission.data.status === 'approved').length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>AREA TERBATAS</Text>
      <Text style={styles.title}>Panel admin</Text>
      <Text style={styles.subtitle}>
        Masuk sebagai {user.email || 'admin'}. Data profil, catatan makan, dan pengajuan pengguna hanya dimuat untuk akun dengan role admin.
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{profiles.length}</Text>
          <Text style={styles.summaryLabel}>Pengguna</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Menunggu</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{approvedCount}</Text>
          <Text style={styles.summaryLabel}>Disetujui</Text>
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.refreshButton}
        onPress={() => void loadAdminData()}
        disabled={loading}
      >
        <Text style={styles.refreshText}>{loading ? 'Memuat data...' : 'Muat ulang data'}</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator color="#16856B" style={styles.loader} />}
      {!!loadError && <Text style={styles.errorText}>{loadError}</Text>}
      {!!actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {!loading && !loadError && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permohonan makanan</Text>
            {submissions.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada permohonan makanan.</Text>
            ) : (
              submissions.map((submission) => {
                const data = submission.data;
                const status = displayValue(data.status, 'pending');
                const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
                return (
                  <View style={styles.card} key={submission.id}>
                    <View style={styles.cardHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.cardTitle}>{displayValue(data.name, 'Makanan tanpa nama')}</Text>
                        <Text style={styles.cardMeta}>
                          {displayValue(data.category)} · dikirim {formatDate(data.createdAt)}
                        </Text>
                        <Text style={[
                          styles.status,
                          status === 'approved' ? styles.approved : status === 'rejected' ? styles.rejected : styles.pending,
                        ]}>
                          {status === 'approved' ? 'Disetujui' : status === 'rejected' ? 'Ditolak' : 'Menunggu tinjauan'}
                        </Text>
                      </View>
                      <Text style={styles.macroText}>
                        {numericValue(data.calories)} kcal{'\n'}
                        P {numericValue(data.protein)} g · L {numericValue(data.fat)} g · K {numericValue(data.carbs)} g
                      </Text>
                    </View>
                    <Text style={styles.detailText}>
                      Porsi: {displayValue(data.servingLabel)} · Hasil resep: {numericValue(data.servings)} porsi
                    </Text>
                    <Text style={styles.detailText}>
                      Pemilik: {displayValue(data.createdBy)}
                    </Text>
                    <Text style={styles.detailText}>Bahan:</Text>
                    {ingredients.map((ingredient, index) => {
                      const item = typeof ingredient === 'object' && ingredient !== null
                        ? ingredient as Record<string, unknown>
                        : {};
                      return (
                        <Text style={styles.ingredientText} key={`${submission.id}-ingredient-${index}`}>
                          • {displayValue(item.name)} — {numericValue(item.amount)} {displayValue(item.unit)}
                        </Text>
                      );
                    })}
                    {!!data.rejectionReason && (
                      <Text style={styles.rejectionReason}>Catatan: {String(data.rejectionReason)}</Text>
                    )}
                    {status === 'pending' && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={styles.approveButton}
                          onPress={() => void approveSubmission(submission.id)}
                          disabled={processingId === submission.id}
                        >
                          <Text style={styles.approveText}>
                            {processingId === submission.id ? 'Memproses...' : 'Setujui & publikasikan'}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.reasonInput}
                          value={rejectionDrafts[submission.id] || ''}
                          onChangeText={(value) => setRejectionDrafts((current) => ({
                            ...current,
                            [submission.id]: value,
                          }))}
                          placeholder="Alasan penolakan (3–300 karakter)"
                          maxLength={300}
                        />
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={styles.rejectButton}
                          onPress={() => void rejectSubmission(submission.id)}
                          disabled={processingId === submission.id}
                        >
                          <Text style={styles.rejectText}>Tolak permohonan</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data pengguna dan catatan makan</Text>
            {profiles.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada profil pengguna.</Text>
            ) : (
              profiles.map((profile) => (
                <View style={styles.card} key={profile.id}>
                  <Text style={styles.cardTitle}>
                    {displayValue(profile.data.name, 'Pengguna tanpa nama')}
                  </Text>
                  <Text style={styles.cardMeta}>UID: {profile.id}</Text>
                  <Text style={styles.detailText}>
                    Berat {displayValue(String(profile.data.weight ?? ''))} kg · tinggi {displayValue(String(profile.data.height ?? ''))} cm · target {displayValue(String(profile.data.targetCalories ?? ''))} kcal
                  </Text>
                  <Text style={styles.detailText}>
                    Tanggal lahir: {displayValue(profile.data.birthDate)} · aktivitas: {displayValue(profile.data.activityLevel)}
                  </Text>
                  <Text style={styles.mealHeading}>Catatan makanan ({profile.meals.length})</Text>
                  {profile.meals.length === 0 ? (
                    <Text style={styles.ingredientText}>Belum ada catatan makanan.</Text>
                  ) : (
                    profile.meals.map((meal, index) => (
                      <View style={styles.mealRow} key={`${profile.id}-${String(meal.id || index)}`}>
                        <Text style={styles.mealName}>{displayValue(meal.name, 'Makanan')}</Text>
                        <Text style={styles.detailText}>
                          {formatDate(meal.loggedAt)} · {numericValue(meal.calories)} kcal · P {numericValue(meal.protein)} g · L {numericValue(meal.fat)} g · K {numericValue(meal.carbs)} g
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
          </View>
        </>
      )}

      <Text style={styles.privacyNote}>
        Informasi profil dan riwayat konsumsi adalah data pribadi. Akses admin harus dibatasi kepada petugas yang berwenang.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  eyebrow: { color: '#16856B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  title: { color: '#18352E', fontSize: 27, fontWeight: '800' },
  subtitle: { color: '#78847E', fontSize: 13, lineHeight: 19, marginTop: 5 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  summaryCard: { flex: 1, backgroundColor: '#EAF4EF', padding: 13, borderRadius: 13 },
  summaryValue: { color: '#16765F', fontSize: 21, fontWeight: '800' },
  summaryLabel: { color: '#52635A', fontSize: 11, marginTop: 2 },
  refreshButton: { alignSelf: 'flex-start', backgroundColor: '#16765F', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 14 },
  refreshText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  loader: { marginVertical: 18 },
  section: { marginTop: 24 },
  sectionTitle: { color: '#203B33', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4EBE6', borderRadius: 15, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  flex: { flex: 1, paddingRight: 10 },
  cardTitle: { color: '#203B33', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#78847E', fontSize: 11, lineHeight: 16, marginTop: 4 },
  macroText: { color: '#16765F', textAlign: 'right', fontSize: 11, fontWeight: '700', lineHeight: 17 },
  status: { fontSize: 11, fontWeight: '800', marginTop: 6 },
  pending: { color: '#A66B00' },
  approved: { color: '#16856B' },
  rejected: { color: '#B42318' },
  detailText: { color: '#52635A', fontSize: 12, lineHeight: 18, marginTop: 5 },
  ingredientText: { color: '#65736B', fontSize: 12, lineHeight: 18, marginLeft: 4 },
  rejectionReason: { color: '#B42318', fontSize: 12, lineHeight: 18, marginTop: 7 },
  actions: { marginTop: 12 },
  approveButton: { backgroundColor: '#16856B', alignItems: 'center', padding: 11, borderRadius: 10 },
  approveText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  reasonInput: { backgroundColor: '#F8FAF8', borderWidth: 1, borderColor: '#E1E9E4', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 12, marginTop: 8 },
  rejectButton: { alignSelf: 'flex-start', backgroundColor: '#FFF1F0', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, marginTop: 8 },
  rejectText: { color: '#B42318', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#78847E', fontSize: 13, paddingVertical: 10 },
  mealHeading: { color: '#203B33', fontSize: 13, fontWeight: '800', marginTop: 12 },
  mealRow: { borderTopWidth: 1, borderTopColor: '#F0F3F1', paddingVertical: 7, marginTop: 5 },
  mealName: { color: '#203B33', fontSize: 12, fontWeight: '700' },
  privacyNote: { color: '#78847E', fontSize: 11, lineHeight: 16, marginTop: 22 },
  errorText: { color: '#B42318', fontSize: 13, lineHeight: 19, marginTop: 10 },
});
