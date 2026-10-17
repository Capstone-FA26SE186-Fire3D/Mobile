import { apiClient } from './client';
import { requestWithSession } from './auth';

export type LearnSummary = {
  id: string;
  slug: string;
  kind: 'Article' | 'Tip' | 'Video';
  title: string;
  summary: string;
  coverImageUrl: string | null;
  publishedAt: string;
};

export type LearnBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'callout'; tone: string; text: string }
  | { type: 'video'; provider: string; videoId: string; url: string }
  | { type: 'image'; url: string; alt: string };

export type LearnPost = {
  id: string;
  slug: string;
  publishedVersionId: string;
  publishedVersion: {
    id: string;
    postId: string;
    contentSchemaVersion: 'fet3d.learn/1';
    kind: string;
    title: string;
    summary: string;
    coverImageUrl: string | null;
    blocks: LearnBlock[];
  };
};

export type LearnPage = { items: LearnSummary[]; total: number; page: number; pageSize: number };
export type BookmarkState = { postId: string; bookmarked: boolean };
export type Bookmark = {
  postId: string;
  available: boolean;
  bookmarkedAt: string;
  slug: string | null;
  title: string | null;
  summary: string | null;
  kind: string | null;
};
export type BookmarkPage = { items: Bookmark[]; total: number; page: number; pageSize: number };

export function listLearnPosts(page = 1, search?: string): Promise<LearnPage> {
  return apiClient.request('/api/learn/posts', { query: { page, pageSize: 20, search } });
}

export function getLearnPost(slug: string): Promise<LearnPost> {
  return apiClient.request(`/api/learn/posts/${encodeURIComponent(slug)}`);
}

export function getBookmark(postId: string): Promise<BookmarkState> {
  return requestWithSession(`/api/learn/bookmarks/${encodeURIComponent(postId)}`);
}

export function listBookmarks(page = 1): Promise<BookmarkPage> {
  return requestWithSession('/api/learn/bookmarks', { query: { page, pageSize: 20 } });
}

export function setBookmark(postId: string, bookmarked: boolean): Promise<BookmarkState> {
  return requestWithSession(`/api/learn/bookmarks/${encodeURIComponent(postId)}`, {
    method: bookmarked ? 'PUT' : 'DELETE',
  });
}
