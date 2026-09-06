/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [applicationData, setApplicationData] = useState({
    profile: {
      name: '',
      state: '',
      district: '',
      language: 'Hindi',
      dialect: '',
      literacyLevel: 'low',
      entrepreneurType: '',
    },

    business: {
      businessName: '',
      category: '',
      initialInvestment: '',
      monthlyRevenue: '',
      monthlyOperatingExpenses: '',
      employees: 0,
      existingDebt: 0,
    },

    location: {
      village: '',
      district: '',
      state: '',
      locationType: 'rural',
      marketType: '',
      customers: '',
    },

    finance: {
      availableCapital: '',
      monthlyExpenses: '',
      monthlyEmi: '',
    },

    result: null,
  })

  const updateSection = (section, data) => {
    setApplicationData((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...data,
      },
    }))
  }

  const setResult = (result) => {
    setApplicationData((current) => ({
      ...current,
      result,
    }))
  }

  return (
    <AppContext.Provider
      value={{
        applicationData,
        updateSection,
        setResult,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp must be used inside AppProvider')
  }

  return context
}