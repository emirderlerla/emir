# Noah Command Center

Kişisel, yapay zeka destekli proje, görev, fikir, takvim ve verimlilik komuta merkezi. Tüm kullanıcı arayüzü Türkçe (`tr-TR`) olarak tasarlanmıştır.

## Özellikler

- **Ana Panel**: Gerçek veritabanı verileriyle hesaplanan proje/görev metrikleri, interaktif grafikler, yaklaşan kilometre taşları, öncelikli görevler, hızlı işlemler ve Gemini API ile günlük özet.
- **Proje Yönetimi**: 9 proje durumu (`Fikir`, `Araştırma`, `Planlama`, `Geliştirme`, `Test`, `Yayınlandı`, `Beklemede`, `Donduruldu`, `İptal Edildi`), kilometre taşları, notlar, dosya ekleri, ilerleme takibi, arşivleme ve geri yükleme.
- **Görev Yönetimi**: Liste ve Kanban görünümü, alt görevler, tahmini/gerçekleşen süre takibi, gecikme tespiti ve proje ilerlemesinin otomatik güncellenmesi.
- **Fikir Havuzu**: Potansiyel/zorluk değerlendirmesi ve projeye dönüştürme akışı.
- **Proje Kontrol Sistemi**: Yapılandırılabilir aktif odak proje limiti (varsayılan 3), limit aşımı uyarısı/manuel geçersiz kılma, sonraki adım eksikliği ve pasif proje tespiti, haftalık yapay zeka değerlendirmesi.
- **Takvim & Hatırlatıcılar**: Aylık, haftalık ve günlük görünüm; proje/görev son tarihleri, kilometre taşları ve hatırlatıcılar.
- **Analitik & Dışa Aktarım**: Tarih aralığı filtreleri, verimlilik eğilimleri, süre karşılaştırmaları, JSON ve CSV tam yedekleme dışa aktarımı.
- **Gemini AI Komuta Asistanı**: Kalıcı sohbet geçmişi, çalışma alanı bağlamı, güvenli sunucu tarafı araç çağırma ve veri değiştiren işlemler için kullanıcı onayı mekanizması.
- **Notlar, Dosyalar, Arşiv, Aktivite Günlüğü, Bildirimler & Ayarlar**.

## Kurulum

```bash
npm install
cp .env.example .env
npm run dev
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde çalışır.

## Ortam Değişkenleri

- `GEMINI_API_KEY`: Google AI Studio üzerinden alınan sunucu tarafı Gemini API anahtarı.
- `AUTH_SECRET`: Oturum belirteçlerini imzalamak için kullanılan gizli anahtar.
- `SQLITE_PATH`: Yerel ilişkisel SQLite veritabanı yolu (varsayılan `./data/noah.db`).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: İsteğe bağlı Supabase PostgreSQL/Auth/Storage yapılandırması.

## Supabase Kurulumu

1. [Supabase](https://supabase.com) üzerinde yeni bir proje oluşturun.
2. SQL Editor bölümünden `supabase/migrations/001_initial_schema.sql` dosyasını çalıştırın.
3. Bu migration dosyası 14 ilişkisel tabloyu, indeksleri, `updated_at` tetikleyicilerini, Row Level Security (RLS) politikalarını ve `emir7-attachments` Storage kovasını otomatik oluşturur.
4. `.env` dosyanıza Supabase proje URL ve anahtarlarını ekleyin.

## Google Gemini API Kurulumu

1. Google AI Studio'dan API anahtarı oluşturun.
2. `.env` dosyasındaki `GEMINI_API_KEY` değişkenine veya barındırma ortamının Gizli Anahtarlar (Secrets) paneline ekleyin.
3. Anahtar hiçbir zaman tarayıcı (istemci) koduna gönderilmez; tüm `@google/genai` çağrıları sunucu tarafındaki `/api/ai/*` uç noktalarından yapılır.

## Üretim Derlemesi ve Dağıtım

```bash
npm run build
npm start
```

## Doğrulama & Test Adımları

1. `npm run lint` ile TypeScript tip denetimini çalıştırın.
2. `npm run build` ile üretim paketini derleyin.
3. Hesap oluşturma / giriş yapma, proje ve görev CRUD işlemleri, fikir dönüştürme, dosya yükleme, takvim gezintisi, AI onay akışı ve JSON/CSV dışa aktarımını doğrulayın.
