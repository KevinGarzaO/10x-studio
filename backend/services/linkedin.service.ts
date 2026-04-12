import fetch from 'node-fetch'
import { supabase } from './supabase.service'

export class LinkedInService {
  /**
   * Core logic to publish to LinkedIn (UGC Post)
   */
  static async publish(params: {
    token: string,
    urn: string,
    text: string,
    imageBase64?: string | null,
    imageUrl?: string | null
  }) {
    const { token, urn, text, imageBase64, imageUrl } = params
    
    let mediaAsset: string | null = null
    let imgBuffer: Buffer | null = null

    // 1. Prepare image if present
    if (imageBase64) {
      imgBuffer = Buffer.from(imageBase64, 'base64')
    } else if (imageUrl) {
      const res = await fetch(imageUrl)
      imgBuffer = Buffer.from(await res.arrayBuffer())
    }

    if (imgBuffer) {
      // a. Register Upload
      const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: urn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }]
          }
        })
      })
      const regData: any = await regRes.json()
      if (!regData.value) throw new Error(`Register upload failed: ${JSON.stringify(regData)}`)
      
      const uploadUrl = regData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl
      mediaAsset = regData.value.asset

      // b. PUT Binary
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: imgBuffer
      })
    }

    // 2. Create UGC Post
    const postBody: any = {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareAppearance: 'DEFAULT',
          shareCommentary: { text },
          shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
          media: mediaAsset ? [{
            status: 'READY',
            media: mediaAsset,
            title: { text: 'Post Image' }
          }] : []
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    }

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postBody)
    })

    const postData: any = await postRes.json()
    if (!postData.id) {
      throw new Error(`LinkedIn publishing failed: ${JSON.stringify(postData)}`)
    }

    return postData.id
  }
}
