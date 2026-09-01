'use client';

interface AvocadoStatusBarProps {
  postsScheduled?: number;
  drafts?: number;
  credits?: number;
  userName?: string;
  userInitials?: string;
  roles?: string[];
}

export default function AvocadoStatusBar({ 
  postsScheduled = 3, 
  drafts = 2, 
  credits = 968,
  userName = 'Kevin Garza',
  userInitials = 'KG',
  roles = ['Founder']
}: AvocadoStatusBarProps) {
  return null
}
