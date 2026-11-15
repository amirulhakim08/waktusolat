import { requireMosqueAdmin } from "@/lib/auth";
import { Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms/ActionForm";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { changePasswordAction, updateAccountAction } from "@/app/admin/actions";

export default async function AccountPage() {
  const { profile } = await requireMosqueAdmin();
  return (
    <>
      <PageHeader title="Tetapan akaun" description={profile.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Maklumat peribadi</CardTitle>
          <ActionForm action={updateAccountAction} className="space-y-4">
            <Field label="Nama penuh" htmlFor="full_name"><Input id="full_name" name="full_name" defaultValue={profile.full_name} required /></Field>
            <Field label="No. telefon" htmlFor="phone"><Input id="phone" name="phone" defaultValue={profile.phone} required /></Field>
            <SubmitButton>Simpan</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Tukar kata laluan</CardTitle>
          <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
            <Field label="Kata laluan semasa" htmlFor="current_password"><Input id="current_password" name="current_password" type="password" autoComplete="current-password" required /></Field>
            <Field label="Kata laluan baharu" htmlFor="new_password" hint="Sekurang-kurangnya 10 aksara dengan huruf besar, huruf kecil dan nombor."><Input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={10} /></Field>
            <Field label="Sahkan kata laluan baharu" htmlFor="confirm_password"><Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton>Tukar kata laluan</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
