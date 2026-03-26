import io

from fastapi import APIRouter, File, Query, UploadFile, HTTPException, status

from app.services.media import media_service, ALLOWED_TYPES, MAX_FILE_SIZE

router = APIRouter()


@router.post('/upload')
async def upload_media(
    file: UploadFile = File(...),
    purpose: str = Query(..., pattern=r'^(post|chat)$'),
):
    """Upload an image file. Returns {url, thumbnail_url, media_type}."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'File type not allowed. Accepted: {", ".join(ALLOWED_TYPES)}',
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f'File too large. Max size: {MAX_FILE_SIZE // (1024 * 1024)}MB',
        )

    result = media_service.upload(
        file_data=io.BytesIO(contents),
        content_type=file.content_type,
        purpose=purpose,
    )
    return result
