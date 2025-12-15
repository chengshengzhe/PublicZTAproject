import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    // 從 localStorage 讀取先前的設定
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    // 保存到 localStorage
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  // 統一的樣式變數
  const getStyles = () => ({
    root: {
      '--bg-primary': darkMode ? '#0f172a' : '#ffffff',
      '--bg-secondary': darkMode ? '#1e293b' : '#f5f7fa',
      '--bg-tertiary': darkMode ? '#334155' : '#e4e9f0',
      '--text-primary': darkMode ? '#f1f5f9' : '#1e293b',
      '--text-secondary': darkMode ? '#94a3b8' : '#64748b',
      '--border-color': darkMode ? '#475569' : '#cbd5e1',
      '--accent-color': '#0ea5e9',
      '--accent-hover': '#0284c7',
      '--success-color': '#22c55e',
      '--danger-color': '#dc2626',
      '--warning-color': '#f97316',
      '--info-color': '#3b82f6',
      '--shadow-sm': darkMode ? '0 1px 2px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
      '--shadow-md': darkMode ? '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      '--shadow-lg': darkMode ? '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      '--shadow-xl': darkMode ? '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    },
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      minHeight: '100vh',
      transition: 'all 0.3s',
    },
    toolbar: {
      background: 'var(--bg-primary)',
      borderBottom: '2px solid var(--border-color)',
      padding: '1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1rem',
      boxShadow: 'var(--shadow-md)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: '600',
      color: 'var(--text-primary)',
      margin: 0,
    },
    content: {
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '1rem',
    },
    card: {
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1rem',
      boxShadow: 'var(--shadow-lg)',
    },
    button: {
      padding: '0.6rem 1.25rem',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: '500',
      transition: 'all 0.2s',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-sm)',
    },
    primaryButton: {
      background: 'var(--accent-color)',
      color: 'white',
      border: 'none',
    },
    dangerButton: {
      color: 'var(--danger-color)',
      borderColor: 'var(--border-color)',
    },
    themeToggle: {
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-color)',
      padding: '0.5rem 0.75rem',
      borderRadius: '6px',
      cursor: 'pointer',
      color: 'var(--text-primary)',
      transition: 'all 0.2s',
      boxShadow: 'var(--shadow-sm)',
      fontSize: '0.9rem',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    th: {
      padding: '0.875rem',
      textAlign: 'left',
      fontWeight: '600',
      color: 'var(--text-primary)',
      borderBottom: '2px solid var(--border-color)',
      background: 'var(--bg-tertiary)',
      fontSize: '0.875rem',
    },
    td: {
      padding: '0.875rem',
      borderBottom: '1px solid var(--border-color)',
      color: 'var(--text-primary)',
      fontSize: '0.875rem',
    },
    status: {
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: '500',
      boxShadow: 'var(--shadow-sm)',
    },
    statusSuccess: {
      background: darkMode ? '#14532d' : '#dcfce7',
      color: darkMode ? '#bbf7d0' : '#166534',
    },
    statusDanger: {
      background: darkMode ? '#7f1d1d' : '#fee2e2',
      color: darkMode ? '#fecaca' : '#991b1b',
    },
    statusWarning: {
      background: darkMode ? '#78350f' : '#fef3c7',
      color: darkMode ? '#fde68a' : '#92400e',
    },
    statusInfo: {
      background: darkMode ? '#1e3a8a' : '#dbeafe',
      color: darkMode ? '#93c5fd' : '#1e40af',
    },
  });

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, getStyles }}>
      {children}
    </ThemeContext.Provider>
  );
};