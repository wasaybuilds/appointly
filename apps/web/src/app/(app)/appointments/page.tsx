import type { Metadata } from 'next';
import { AppointmentList } from '@/components/appointments/appointment-list';

export const metadata: Metadata = {
  title: 'Appointments — Appointly',
};

export default function AppointmentsPage() {
  return <AppointmentList />;
}
