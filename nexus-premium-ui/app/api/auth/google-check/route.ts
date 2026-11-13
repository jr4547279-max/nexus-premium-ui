import { NextResponse } from 'next/server'

export async function GET(){
  return NextResponse.json({configured:false,oauthReady:false,error:'google_sign_in_not_configured'}, {status:501,headers:{'cache-control':'no-store'}})
}
