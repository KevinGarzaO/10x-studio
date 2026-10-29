import { AccountLayout } from '@/components/account-pages'
import { NotificationsList } from '@/components/notifications-list'

export default function Page() {
  return <AccountLayout active="notifications"><NotificationsList /></AccountLayout>
}
