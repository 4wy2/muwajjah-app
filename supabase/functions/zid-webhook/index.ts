// مستقبِل إشعارات متجر زد: يفعّل اشتراك مُوجّه بلس تلقائيًا بعد الدفع.
// لا يثق بمحتوى الإشعار: يعيد جلب الطلب من واجهة زد ويتحقق من حالة الدفع والمنتج.
// يبقى معطّلًا (503) حتى تُضبط الأسرار التالية في Supabase (وليس في الواجهة):
//   ZID_WEBHOOK_TOKEN   سر عشوائي يضاف لرابط الإشعار: .../zid-webhook?token=...
//   ZID_AUTHORIZATION   قيمة ترويسة Authorization من تطبيق شركاء زد (Bearer ...)
//   ZID_MANAGER_TOKEN   قيمة X-Manager-Token للمتجر
//   ZID_PRODUCT_SKU     رمز SKU لمنتج الاشتراك في متجرك (أو رقم المنتج)
// SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY يوفّرهما Supabase تلقائيًا.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => (Deno.env.get(k) || "").trim();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  const token = env("ZID_WEBHOOK_TOKEN");
  const auth = env("ZID_AUTHORIZATION");
  const manager = env("ZID_MANAGER_TOKEN");
  const product = env("ZID_PRODUCT_SKU");
  if (!token || !auth || !manager || !product)
    return json(503, { error: "not_configured" });
  if (!sameSecret(new URL(req.url).searchParams.get("token") || "", token))
    return json(401, { error: "token" });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "body" });
  }
  const rawId =
    (payload as { id?: unknown }).id ??
    (payload as { order?: { id?: unknown } }).order?.id;
  const orderId = String(rawId ?? "");
  if (!/^\d{1,15}$/.test(orderId)) return json(400, { error: "order_id" });

  // Source of truth: the order as Zid reports it now.
  const res = await fetch(
    `https://api.zid.sa/v1/managers/store/orders/${orderId}/view`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        Authorization: auth.startsWith("Bearer ") ? auth : `Bearer ${auth}`,
        "X-Manager-Token": manager,
      },
    },
  );
  if (!res.ok) return json(502, { error: "zid_fetch", status: res.status });
  const order = ((await res.json()) as { order?: Record<string, unknown> }).order;
  if (!order) return json(502, { error: "zid_order" });

  const products = (order.products as Array<Record<string, unknown>>) || [];
  const isSubscription = products.some(
    (p) => String(p.sku ?? "") === product || String(p.id ?? "") === product,
  );
  if (!isSubscription) return json(200, { result: "ignored_other_product" });

  const paid = String(order.payment_status ?? "").toLowerCase() === "paid";
  const email = String(
    (order.customer as { email?: unknown } | undefined)?.email ?? "",
  );

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("guide_service_zid_order", {
    order_id: orderId,
    buyer_email: email,
    paid,
  });
  if (error) return json(500, { error: "grant", message: error.message });
  return json(200, { result: data });
});
