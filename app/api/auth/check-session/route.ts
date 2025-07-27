import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    console.log('🔐 Check session API called')
    
    const supabase = await createClient()
    
    // Debug: Log available cookies
    const cookieStore = await cookies()
    const authToken0 = await cookieStore.get('sb-auth-token.0')
    const authToken1 = await cookieStore.get('sb-auth-token.1')
    const projectToken0 = await cookieStore.get('sb-ekdjxzhujettocosgzql-auth-token.0')
    const projectToken1 = await cookieStore.get('sb-ekdjxzhujettocosgzql-auth-token.1')
    
    console.log('🔐 Available cookies:', {
      hasToken0: !!authToken0,
      hasToken1: !!authToken1,
      hasProjectToken0: !!projectToken0,
      hasProjectToken1: !!projectToken1,
      token0Length: authToken0?.value?.length || 0,
      token1Length: authToken1?.value?.length || 0,
      projectToken0Length: projectToken0?.value?.length || 0,
      projectToken1Length: projectToken1?.value?.length || 0,
      token0Preview: authToken0?.value?.substring(0, 20) + '...',
      token1Preview: authToken1?.value?.substring(0, 20) + '...',
      projectToken0Preview: projectToken0?.value?.substring(0, 20) + '...',
      projectToken1Preview: projectToken1?.value?.substring(0, 20) + '...'
    })
    
    // Try to get session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.log('🔐 Session error:', sessionError.message)
      return NextResponse.json({ 
        success: false, 
        hasSession: false, 
        error: sessionError.message 
      })
    }
    
    if (session && session.user) {
      console.log('🔐 Session found for user:', session.user.id)
      return NextResponse.json({
        success: true,
        hasSession: true,
        user: {
          id: session.user.id,
          email: session.user.email
        }
      })
    }
    
    console.log('🔐 Session not found, trying getUser()...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.log('🔐 User check error:', userError)
      return NextResponse.json({ 
        success: false, 
        hasSession: false, 
        error: userError.message 
      })
    }
    
    if (user) {
      console.log('🔐 User found:', user.id)
      return NextResponse.json({
        success: true,
        hasSession: true,
        user: {
          id: user.id,
          email: user.email
        }
      })
    }
    
    console.log('🔐 No session or user found')
    return NextResponse.json({ 
      success: false, 
      hasSession: false, 
      error: 'No session or user found' 
    })
    
  } catch (error) {
    console.error('🔐 Check session API error:', error)
    return NextResponse.json({ 
      success: false, 
      hasSession: false, 
      error: 'Internal server error' 
    })
  }
} 