"use client";
import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input } from "@/components/ui";
import { ZonePicker, type ZoneOption } from "@/components/forms/ZonePicker";

export function RegisterForm({ zones }: { zones: ZoneOption[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<null | { needsVerification: boolean }>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("password_confirm")) {
      setErrors({ password_confirm: "Kata laluan tidak sepadan" });
      return;
    }
    fd.delete("password_confirm");
    setPending(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch("/api/register", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrors(json.fields ?? {});
        setMessage(json.error ?? "Pendaftaran gagal. Sila cuba lagi.");
        return;
      }
      setDone({ needsVerification: json.needsVerification });
    } catch {
      setMessage("Tiada sambungan. Sila cuba lagi.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4" data-testid="register-success">
        <Alert tone="success" title="Permohonan dihantar">
          {done.needsVerification
            ? "Kami telah menghantar pautan pengesahan ke e-mel anda. Sila sahkan e-mel anda — permohonan akan disemak oleh pentadbir sistem selepas itu."
            : "Permohonan anda sedang menunggu kelulusan pentadbir sistem."}
        </Alert>
        <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">Ke halaman log masuk →</Link>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate={false}>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-sm font-semibold uppercase tracking-wide text-brand-800">Maklumat pemohon</legend>
        <Field label="Nama penuh" htmlFor="full_name" error={err("full_name")}>
          <Input id="full_name" name="full_name" required autoComplete="name" invalid={!!err("full_name")} />
        </Field>
        <Field label="Jawatan dalam masjid/surau" htmlFor="applicant_position" error={err("applicant_position")} hint="Cth. Pengerusi, Setiausaha, Nazir">
          <Input id="applicant_position" name="applicant_position" required invalid={!!err("applicant_position")} />
        </Field>
        <Field label="E-mel" htmlFor="email" error={err("email")}>
          <Input id="email" name="email" type="email" required autoComplete="email" invalid={!!err("email")} />
        </Field>
        <Field label="No. telefon" htmlFor="phone" error={err("phone")} hint="Cth. 012-345 6789">
          <Input id="phone" name="phone" type="tel" required autoComplete="tel" invalid={!!err("phone")} />
        </Field>
        <Field label="Kata laluan" htmlFor="password" error={err("password")} hint="Sekurang-kurangnya 10 aksara dengan huruf besar, huruf kecil dan nombor.">
          <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" invalid={!!err("password")} />
        </Field>
        <Field label="Sahkan kata laluan" htmlFor="password_confirm" error={err("password_confirm")}>
          <Input id="password_confirm" name="password_confirm" type="password" required autoComplete="new-password" invalid={!!err("password_confirm")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-sm font-semibold uppercase tracking-wide text-brand-800">Maklumat masjid / surau</legend>
        <div className="sm:col-span-2">
          <Field label="Nama masjid / surau" htmlFor="mosque_name" error={err("mosque_name")}>
            <Input id="mosque_name" name="mosque_name" required invalid={!!err("mosque_name")} placeholder="Cth. Surau Al-Amin" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Alamat" htmlFor="address" error={err("address")}>
            <Input id="address" name="address" required invalid={!!err("address")} />
          </Field>
        </div>
        <Field label="Daerah" htmlFor="district" error={err("district")}>
          <Input id="district" name="district" required invalid={!!err("district")} />
        </Field>
        <div className="hidden sm:block" />
        <ZonePicker zones={zones} errors={errors} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand-800">Dokumen sokongan (pilihan)</legend>
        <Field label="Surat kebenaran / lantikan" htmlFor="document" error={err("document")}
          hint="Tidak wajib. PDF, JPG, PNG atau WebP, maksimum 5 MB. Dokumen disimpan secara peribadi dan hanya dilihat oleh pentadbir sistem.">
          <Input id="document" name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" invalid={!!err("document")} />
        </Field>
      </fieldset>

      {message && <Alert tone="error">{message}</Alert>}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Menghantar…" : "Hantar permohonan"}</Button>
    </form>
  );
}
