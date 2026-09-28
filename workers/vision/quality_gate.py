"""
Quality Gate for Camera Vision Results
คัดกรองความถูกต้องและคุณภาพของภาพและผลตรวจวัดก่อนนำไปพยากรณ์
"""

class QualityGate:
    MIN_CONFIDENCE_THRESHOLD = 0.80
    MIN_IMAGE_SIZE_BYTES = 5000

    @classmethod
    def evaluate(cls, image_bytes: bytes, detection_result: dict) -> dict:
        """
        ประเมินผลการตรวจวัด:
        returns:
        - status: "PASSED" | "FLAGGED_FOR_REVIEW" | "REJECTED"
        - reason: คำอธิบาย
        """
        if len(image_bytes) < cls.MIN_IMAGE_SIZE_BYTES:
            return {
                "status": "REJECTED",
                "reason": "IMAGE_CORRUPTED_OR_EMPTY"
            }

        conf = detection_result.get("confidence", 0.0)
        if conf < cls.MIN_CONFIDENCE_THRESHOLD:
            return {
                "status": "FLAGGED_FOR_REVIEW",
                "reason": f"LOW_CONFIDENCE_{conf:.2f}_BELOW_{cls.MIN_CONFIDENCE_THRESHOLD}"
            }

        # ตรวจสอบค่ากระโดดผิดปกติ (Sanity Check)
        water_level = detection_result.get("water_level", 0.0)
        if water_level < 0.5 or water_level > 8.0:
            return {
                "status": "FLAGGED_FOR_REVIEW",
                "reason": f"OUT_OF_BOUNDS_LEVEL_{water_level}M"
            }

        return {
            "status": "PASSED",
            "reason": "CONFIDENCE_HIGH_PASSED_SANITY"
        }
