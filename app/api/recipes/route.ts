import { optionsResponse, jsonResponse } from "@/lib/cors"
import { RECIPES } from "@/lib/types"

export async function OPTIONS(req: Request) {
  return optionsResponse(req)
}

export async function GET(req: Request) {
  const recipes = Object.values(RECIPES).map((r) => ({
    name: r.name,
    description: r.description,
    frame_size: r.frame_size,
    autoplay: r.autoplay,
    slides: r.slides.map((s) => ({
      type: s.type,
      defaults: s.defaults,
    })),
  }))

  return jsonResponse({ recipes }, 200, req)
}
