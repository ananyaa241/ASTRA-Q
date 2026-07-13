'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSMessage } from '@/lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface UseWebSocketOptions {
  onMessage?: (msg: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(`${WS_URL}/ws/events`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttempts.current = 0;
      optionsRef.current.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        setLastMessage(msg);
        optionsRef.current.onMessage?.(msg);
      } catch {
        // silently ignore malformed frames
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      optionsRef.current.onDisconnect?.();
      wsRef.current = null;

      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { status, lastMessage, connect, disconnect };
}
