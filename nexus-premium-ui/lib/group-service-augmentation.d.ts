import './group-service'

declare module './group-service' {
  interface GroupSummary {
    goldenWindow?: {
      date: string
      time: string
    }
  }
}
