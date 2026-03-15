import { useState, useEffect } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { Password } from 'primereact/password'
import { Dropdown } from 'primereact/dropdown'

const TEXT_MODELS = [
  { label: 'Claude (Anthropic)', value: 'claude', icon: 'pi-bolt' },
  { label: 'ChatGPT (OpenAI)',   value: 'chatgpt', icon: 'pi-comment' },
  { label: 'Gemini (Google)',    value: 'gemini', icon: 'pi-sparkles' },
  { label: 'Mistral AI',         value: 'mistral', icon: 'pi-cloud' },
  { label: 'Llama (Meta/Together)', value: 'llama', icon: 'pi-facebook' },
  { label: 'Grok (xAI)',         value: 'grok', icon: 'pi-twitter' },
  { label: 'Command (Cohere)',   value: 'cohere', icon: 'pi-comment' },
  { label: 'DeepSeek',           value: 'deepseek', icon: 'pi-code' },
]

const IMG_MODELS = [
  { label: 'DALL-E & GPT Visión (OpenAI)', value: 'dalle', icon: 'pi-image' },
  { label: 'Imagen (Google Vertex)',       value: 'imagen', icon: 'pi-google' },
  { label: 'Nano Banana (Gemini Flash)',   value: 'nanobanana', icon: 'pi-bolt' },
  { label: 'FLUX (Black Forest Labs)',     value: 'flux', icon: 'pi-bolt' },
  { label: 'Stable Diffusion (Stability)', value: 'stable-diffusion', icon: 'pi-box' },
  { label: 'Ideogram',                     value: 'ideogram', icon: 'pi-image' },
  { label: 'Midjourney (Alternativa)',     value: 'midjourney', icon: 'pi-palette' },
  { label: 'Firefly (Adobe)',              value: 'firefly', icon: 'pi-pencil' },
]

const VERSIONS: Record<string, { label: string; value: string }[]> = {
  // Texto
  claude: [
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
    { label: 'Claude Opus 4.5', value: 'claude-opus-4-5' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' }
  ],
  chatgpt: [
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.2', value: 'gpt-5.2' },
    { label: 'GPT-5 mini', value: 'gpt-5-mini' },
    { label: 'GPT-4.1', value: 'gpt-4.1-2025-04-14' },
    { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini-2025-04-14' },
    { label: 'GPT-4.1 Nano', value: 'gpt-4.1-nano-2025-04-14' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'o3', value: 'openai/o3-2025-04-16' },
    { label: 'o4-mini', value: 'openai/o4-mini-2025-04-16' },
    { label: 'GPT OSS 120B (open)', value: 'openai/gpt-oss-120b' },
    { label: 'GPT OSS 20B (open)', value: 'openai/gpt-oss-20b' }
  ],
  gemini: [
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Flash-Lite', value: 'gemini-2.5-flash-lite' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 2.0 Flash-Lite', value: 'gemini-2.0-flash-lite' }
  ],
  mistral: [
    { label: 'Mistral Large 3', value: 'mistral-large-latest' },
    { label: 'Mistral Small 3', value: 'mistral-small-latest' },
    { label: 'Codestral 25.01', value: 'codestral-latest' },
    { label: 'Pixtral Large', value: 'pixtral-large-latest' },
    { label: 'Mistral 7B', value: 'open-mistral-7b' }
  ],
  llama: [
    { label: 'Llama 3.3 70B', value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
    { label: 'Llama 3.2 90B Vision', value: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo' },
    { label: 'Llama 3.2 11B Vision', value: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo' },
    { label: 'Llama 3.2 3B', value: 'meta-llama/Llama-3.2-3B-Instruct-Turbo' },
    { label: 'Llama 3.2 1B', value: 'meta-llama/Llama-3.2-1B-Instruct-Turbo' }
  ],
  grok: [
    { label: 'Grok 4', value: 'grok-4' },
    { label: 'Grok 4 Fast', value: 'grok-4-fast-reasoning' },
    { label: 'Grok 3', value: 'grok-3' },
    { label: 'Grok 3 Mini', value: 'grok-3-mini' }
  ],
  cohere: [
    { label: 'Command A', value: 'command-a-03-2025' },
    { label: 'Command R+', value: 'command-r-plus' },
    { label: 'Command R', value: 'command-r' },
    { label: 'Command R7B', value: 'command-r7b-12-2024' }
  ],
  deepseek: [
    { label: 'DeepSeek V3', value: 'deepseek-chat' },
    { label: 'DeepSeek R1', value: 'deepseek-reasoner' },
    { label: 'DeepSeek V3.2', value: 'DeepSeek-V3.2' }
  ],
  // Imágenes
  dalle: [
    { label: 'GPT Image 1.5', value: 'gpt-image-1.5' },
    { label: 'DALL-E 3', value: 'dall-e-3' }
  ],
  imagen: [
    { label: 'Imagen 4 Ultra', value: 'imagen-4-0-ultra-generate-001' },
    { label: 'Imagen 4 Standard', value: 'imagen-4-0-generate-001' }
  ],
  nanobanana: [
    { label: 'Gemini 3.1 Flash Image', value: 'gemini-3.1-flash-image' }
  ],
  flux: [
    { label: 'FLUX 1.1 Pro (Replicate)', value: 'black-forest-labs/flux-1.1-pro' },
    { label: 'FLUX 1.1 Pro Ultra', value: 'black-forest-labs/flux-1.1-pro-ultra' },
    { label: 'FLUX Kontext Pro', value: 'black-forest-labs/flux-kontext-pro' },
    { label: 'FLUX Schnell', value: 'black-forest-labs/flux-schnell' }
  ],
  'stable-diffusion': [
    { label: 'Stable Diffusion 3.5 Large', value: 'stability/stable-diffusion-3-5-large' }
  ],
  ideogram: [
    { label: 'Ideogram v3', value: 'ideogram-ai/ideogram-v3' },
    { label: 'Ideogram v3 Turbo', value: 'ideogram-ai/ideogram-v3-turbo' }
  ],
  midjourney: [
    { label: 'V7', value: 'v7' }
  ],
  firefly: [
    { label: 'Firefly 3', value: 'firefly-3' }
  ]
}

const PROVIDER_INFO: Record<string, { label: string; url?: string; ph: string }> = {
  claude: { label: 'API Key de Anthropic (Claude)', url: 'https://console.anthropic.com/', ph: 'sk-ant-...' },
  chatgpt: { label: 'API Key de OpenAI (ChatGPT)', url: 'https://platform.openai.com/api-keys', ph: 'sk-proj-...' },
  gemini: { label: 'API Key de Google (Gemini/Vertex)', url: 'https://aistudio.google.com/app/apikey', ph: 'AIzaSy...' },
  mistral: { label: 'API Key de Mistral AI', url: 'https://console.mistral.ai/', ph: '...' },
  llama: { label: 'API Key de Together AI (Llama)', url: 'https://api.together.xyz/settings/api-keys', ph: '...' },
  grok: { label: 'API Key de xAI (Grok)', url: 'https://console.x.ai/', ph: 'xai-...' },
  cohere: { label: 'API Key de Cohere', url: 'https://dashboard.cohere.com/api-keys', ph: '...' },
  deepseek: { label: 'API Key de DeepSeek', url: 'https://platform.deepseek.com/', ph: 'sk-...' },
  dalle: { label: 'API Key de OpenAI (GPT Visión)', url: 'https://platform.openai.com/api-keys', ph: 'sk-proj-...' },
  imagen: { label: 'API Key de Google Cloud (Imagen)', url: 'https://console.cloud.google.com/', ph: '...' },
  nanobanana: { label: 'API Key de Nano Banana', ph: 'nb-...' },
  flux: { label: 'API Key de Replicate (FLUX)', url: 'https://replicate.com/', ph: 'r8_...' },
  'stable-diffusion': { label: 'API Key de Stability AI', url: 'https://platform.stability.ai/account/keys', ph: 'sk-...' },
  ideogram: { label: 'API Key de Ideogram', url: 'https://ideogram.ai/manage-api', ph: '...' },
  midjourney: { label: 'Token de API Alternativa (Midjourney)', ph: '...' },
  firefly: { label: 'Credentials de Adobe Firefly', url: 'https://developer.adobe.com/', ph: '...' },
}

export function SettingsSection() {
  const { settings, saveSettings } = useApp()
  
  // Local state for smooth typing before saving
  const [localSettings, setLocalSettings] = useState({
    textModel: settings.textModel || 'claude',
    imgModel:  settings.imgModel  || 'dalle',
    apiKeys:   settings.apiKeys   || { claude: settings.apiKey || '' },
    modelVersions: settings.modelVersions || {}
  })

  // Sync when global settings change (e.g., initial load)
  useEffect(() => {
    setLocalSettings({
      textModel: settings.textModel || 'claude',
      imgModel:  settings.imgModel  || 'dalle',
      apiKeys:   settings.apiKeys   || { claude: settings.apiKey || '' },
      modelVersions: settings.modelVersions || {}
    })
  }, [settings.textModel, settings.imgModel, settings.apiKeys, settings.apiKey, settings.modelVersions])

  const handleSave = async (updated: typeof localSettings) => {
    // Keep internal legacy apiKey synced with claude for backward compatibility if needed
    await saveSettings({ 
      ...settings, 
      textModel: updated.textModel,
      imgModel: updated.imgModel,
      apiKeys: updated.apiKeys,
      modelVersions: updated.modelVersions,
      apiKey: updated.apiKeys.claude || settings.apiKey
    })
  }

  const updateKey = (provider: string, value: string) => {
    const next = { ...localSettings, apiKeys: { ...localSettings.apiKeys, [provider as keyof typeof localSettings.apiKeys]: value } }
    setLocalSettings(next)
  }

  const updateVersion = (provider: string, value: string) => {
    const next = { ...localSettings, modelVersions: { ...localSettings.modelVersions, [provider as keyof typeof localSettings.modelVersions]: value } }
    setLocalSettings(next)
    handleSave(next)
  }

  const blurKey = () => handleSave(localSettings)

  const changeTextModel = (val: string) => {
    const next = { ...localSettings, textModel: val as any }
    setLocalSettings(next)
    handleSave(next)
  }

  const changeImgModel = (val: string) => {
    const next = { ...localSettings, imgModel: val as any }
    setLocalSettings(next)
    handleSave(next)
  }

  const itemTemplate = (option: any) => (
    <div className="flex items-center gap-2">
      <i className={`pi ${option.icon} text-stone-500`}></i>
      <span>{option.label}</span>
    </div>
  )

  const activeTextVersions = VERSIONS[localSettings.textModel] || []
  const currentTextVersion = localSettings.modelVersions[localSettings.textModel as keyof typeof localSettings.modelVersions] || activeTextVersions[0]?.value

  const activeImgVersions = VERSIONS[localSettings.imgModel] || []
  const currentImgVersion = localSettings.modelVersions[localSettings.imgModel as keyof typeof localSettings.modelVersions] || activeImgVersions[0]?.value

  const txtProv = PROVIDER_INFO[localSettings.textModel] || { label: `API Key (${localSettings.textModel})`, ph: '...' }
  const imgProv = PROVIDER_INFO[localSettings.imgModel] || { label: `API Key (${localSettings.imgModel})`, ph: '...' }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8 border-b border-[#e9e9e7] pb-4">
        <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
          <i className="pi pi-cog text-[#9b9a97]"></i> Configuración del Workspace
        </h1>
        <p className="text-sm text-[#9b9a97] mt-1">
          Gestiona tus claves de API y preferencias de Inteligencia Artificial
        </p>
      </div>

      <div className="grid gap-8">
        {/* IA de Texto */}
        <section className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-6 py-4 flex items-center gap-3">
            <i className="pi pi-align-left text-white/70"></i>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Modelo de Texto Principal</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-6">
              
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Proveedor de IA</label>
                  <Dropdown 
                    value={localSettings.textModel} 
                    options={TEXT_MODELS} 
                    onChange={(e) => changeTextModel(e.value)} 
                    itemTemplate={itemTemplate}
                    valueTemplate={itemTemplate}
                    className="w-full input text-sm" 
                  />
                  <p className="text-xs text-stone-400 mt-1">Este modelo se usará para el Redactor IA y la generación de ideas.</p>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Versión del Modelo</label>
                  <Dropdown 
                    value={currentTextVersion} 
                    options={activeTextVersions} 
                    onChange={(e) => updateVersion(localSettings.textModel, e.value)} 
                    className="w-full input text-sm" 
                    placeholder="Selecciona versión..."
                  />
                  <p className="text-xs text-stone-400 mt-1">Selecciona la versión específica que deseas usar.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-6">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">{txtProv.label}</label>
                <Password
                  value={localSettings.apiKeys[localSettings.textModel as keyof typeof localSettings.apiKeys] || ''}
                  onChange={(e: any) => updateKey(localSettings.textModel, e.target.value)}
                  onBlur={blurKey}
                  placeholder={txtProv.ph}
                  feedback={false}
                  toggleMask
                  inputClassName="input w-full md:w-[600px] font-mono text-sm"
                />
                {txtProv.url && (
                  <a href={txtProv.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1 w-fit">
                    Obtener API Key <i className="pi pi-external-link text-[10px]"></i>
                  </a>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* IA de Imagenes */}
        <section className="bg-white border border-[#e9e9e7] rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#1a1a1a] border-b border-[#2e2e2e] px-6 py-4 flex items-center gap-3">
            <i className="pi pi-image text-white/70"></i>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Modelo de Imágenes Generativas</h2>
          </div>
          <div className="p-6">
            <div className="grid gap-6">
              
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Proveedor de Imágenes</label>
                  <Dropdown 
                    value={localSettings.imgModel} 
                    options={IMG_MODELS} 
                    onChange={(e) => changeImgModel(e.value)} 
                    itemTemplate={itemTemplate}
                    valueTemplate={itemTemplate}
                    className="w-full input text-sm" 
                  />
                  <p className="text-xs text-stone-400 mt-1">Este modelo se usará para generar portadas y miniaturas automáticas.</p>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">Versión del Modelo</label>
                  <Dropdown 
                    value={currentImgVersion} 
                    options={activeImgVersions} 
                    onChange={(e) => updateVersion(localSettings.imgModel, e.value)} 
                    className="w-full input text-sm" 
                    placeholder="Selecciona versión..."
                  />
                  <p className="text-xs text-stone-400 mt-1">Selecciona la versión específica que deseas usar.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-6">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest">{imgProv.label}</label>
                <Password
                  value={localSettings.apiKeys[localSettings.imgModel as keyof typeof localSettings.apiKeys] || ''}
                  onChange={(e: any) => updateKey(localSettings.imgModel, e.target.value)}
                  onBlur={blurKey}
                  placeholder={imgProv.ph}
                  feedback={false}
                  toggleMask
                  inputClassName="input w-full md:w-[600px] font-mono text-sm"
                />
                {imgProv.url && (
                  <a href={imgProv.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1 w-fit">
                    Obtener API Key <i className="pi pi-external-link text-[10px]"></i>
                  </a>
                )}
              </div>

            </div>
          </div>
        </section>
      </div>

    </div>
  )
}
