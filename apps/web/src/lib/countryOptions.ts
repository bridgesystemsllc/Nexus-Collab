export const COUNTRY_OPTIONS = ['USA', 'Canada', 'EU', 'UK', 'Asia', 'Other'] as const

export type CountryOption = (typeof COUNTRY_OPTIONS)[number]
